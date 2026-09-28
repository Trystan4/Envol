# Conception d'Envol

## Objectif

Réviser des fiches de QCM sur téléphone (iPhone, Android) ou ordinateur, en ligne ou non. L'app doit :

1. choisir les questions selon les résultats passés, en révision comme en test blanc, et tirer au
   hasard quand il n'y a pas encore de résultat ;
2. garder les progrès sur le téléphone, avec une copie exportable et un import sans risque ;
3. montrer où on en est : maîtrise globale, par thème, tendance des tests blancs ;
4. rester hébergeable sur GitHub Pages : fichiers statiques, aucune dépendance de production.

## Architecture

Modules JavaScript natifs, CSS natif découpé, aucune étape de build : `src/` est publié tel quel.

| Module | Rôle | Dépend de |
| --- | --- | --- |
| `config.js` | Tous les nombres réglables | — |
| `util.js` | Aléatoire reproductible, dates, formatage, échappement HTML | `config` |
| `deck.js` | Lecture et validation des fiches JSON | — |
| `storage.js` | Sauvegarde, validation stricte, import/export, annulation | `config` |
| `engine.js` | Poids des questions, tirage pondéré, composition des séances, effet d'une réponse | `config`, `util` |
| `summary.js` | Chiffres affichés | `engine`, `util` |
| `screens/*.js` | Un écran chacun : données → HTML | `util` |
| `app.js` | État, actions, démarrage | tout le reste |

`deck`, `storage`, `engine` et `summary` sont **purs** : ni DOM, ni `Date.now()` caché, ni
`Math.random()` imposé. Le temps et le générateur aléatoire sont passés en paramètre, ce qui rend
chaque règle testable avec `node --test`.

## Le moteur

### État d'une question

```
{ level: 0-5, due: date de révision, seen: réponses, correct: bonnes réponses,
  firstSeen: date de découverte, lastWrong: date de la dernière erreur | null,
  boostUntil?: fin de la poussée après une erreur en test blanc }
```

Le niveau suit une répétition espacée classique (`INTERVALS` : 0, 1, 2, 4, 7, 15 jours) :
bonne réponse en révision = niveau +1 ; erreur = niveau −2 et à revoir tout de suite.

Une question ratée **ne revient pas dans la même séance** : elle revient aux séances suivantes, avec
un poids doublé (voir « erreur récente »). L'espacement se fait dans le temps, pas dans la séance.

En test blanc :
- une **bonne réponse** compte comme en révision si la question était nouvelle ou à revoir ; sinon,
  rien ne change (un test fait juste après une révision ne gonfle pas les niveaux) ;
- une **erreur** pèse plus qu'en révision, car elle a eu lieu en conditions d'examen : la question
  retombe au niveau 0 et son poids est doublé pendant 3 jours (`MISTAKE_BOOST_DAYS.test`, noté
  `boostUntil`), au lieu de 24 h.

### Poids

```
poids = byLevel[niveau] × (1 + 3 × taux d'erreur lissé) × échéance × erreur récente
```

- **taux d'erreur lissé** = (erreurs + 1) / (réponses + 2) : une seule erreur sur une seule réponse
  n'est pas traitée comme 100 % d'échec.
- **échéance** : ×0,3 si la question n'est pas encore à revoir (possible, mais moins probable),
  de ×1 à ×2 si elle est en retard (plafond à 7 jours de retard).
- **erreur récente** : ×2 si ratée dans les dernières 24 h en révision, ou dans les 3 derniers jours en
  test blanc (`boostUntil`). Une erreur en révision ne raccourcit pas la poussée d'un test blanc.
- plancher à 0,05 : aucune question ne devient impossible.
- une question jamais vue vaut 1.

### Tirage pondéré

Chaque question reçoit une clé aléatoire `−ln(1 − u) / poids`, on garde les plus petites. C'est un
tirage sans remise où la probabilité de sortir est proportionnelle au poids. **Quand aucune question
n'a de résultat, tous les poids valent 1 et c'est un mélange aléatoire uniforme** (vérifié par un test
statistique).

### Séance de révision (20 questions)

1. **Nouvelles questions** : un quota par jour. Sans date d'examen : 10 par jour. Avec une date :
   assez pour que tout soit découvert 3 jours avant l'examen (au moins 3 par jour). Au plus 15 par
   séance. Les nouvelles déjà découvertes aujourd'hui sont décomptées.
   Le plan du jour (`dailyPlan`) donne ce rythme et le nombre de séances qu'il demande : l'accueil
   annonce toutes les questions du jour (« 42 questions à revoir aujourd'hui, en 3 séances ») et
   Réglages le rythme conseillé. Par exemple, avec 300 questions et un examen dans 10 jours, il faut
   environ 43 nouvelles par jour, donc 3 séances ; à 30 jours ou plus, une séance par jour suffit.
2. **Questions connues** : tirage pondéré pour compléter à 20.
3. Les premiers jours, s'il n'y a pas assez de questions connues, on complète avec des nouvelles.
4. « On s'y met » (après un bilan) multiplie par 3 le poids des thèmes à renforcer.

### Séances ciblées

- **Réviser ce thème** (Mes résultats) : même tirage qu'une séance de révision, limité au thème.
- **Les plus ratées** : les 10 questions au plus grand nombre d'erreurs (puis au plus fort taux
  d'erreur), jamais une question sans erreur ; « Réviser ces questions » les pose dans le désordre.
- **Reprendre une séance** : la séance en cours est gardée sur l'appareil (`session.js`, clé
  `envol-v2-session`) à chaque question ; l'accueil propose de la reprendre pendant 12 h. Une question
  déjà répondue n'est pas reposée. Terminer ou quitter la séance l'efface.

- **Séance express** : 5 questions, tirées comme une séance de révision (nouvelles dans la même
  proportion, au plus 4).

### Cours

`course.js` rassemble les extraits des questions (`excerpt`) par thème, sans doublon, dans l'ordre des
pages : c'est le cours tel que les fiches le citent. La recherche ignore accents et majuscules et
porte sur les textes, les tableaux et les descriptions d'images ; seule la liste est redessinée à
chaque lettre, le champ garde le clavier.

### Fiches mises à jour, signalements corrigés

- Une empreinte par question (texte et réponses) est gardée sur l'appareil (clé `envol-v2-deck`, hors
  sauvegarde). À l'ouverture suivante, l'accueil annonce les questions nouvelles et corrigées jusqu'à
  « Compris ». À la première ouverture, rien n'est annoncé.
- Une question signalée dont la fiche donne désormais une autre réponse que celle vue au signalement
  est annoncée comme corrigée sur l'accueil (elle revient déjà d'elle-même dans les séances).

### Suivi du plan

- **Progression du jour** (accueil) : réponses données aujourd'hui (séances terminées et tests blancs)
  sur l'objectif du jour, c'est-à-dire ces réponses plus ce qui reste à faire aujourd'hui.
- **Date de découverte** (Mes résultats) : au rythme du plan du jour, le jour où la dernière question
  nouvelle sera vue.

### Test blanc (20 questions)

Les 20 places sont réparties entre les thèmes **en proportion de leur nombre de questions** (méthode
du plus fort reste), pour ressembler à un examen. Dans chaque thème, tirage pondéré avec la racine
carrée du poids : les points faibles ressortent plus souvent qu'au hasard, mais moins qu'en révision,
pour que la note reste représentative.

### Mes erreurs, drapeaux

- **Mes erreurs** (`mistakePool`) : questions ratées dans les `MISTAKES_WINDOW_DAYS` derniers jours et
  encore sous le niveau de maîtrise, plus les questions marquées « à revoir ». Tirage pondéré, 20 au plus.
- **Drapeau** : « à revoir » multiplie le poids par 3 en révision et place la question dans Mes erreurs.
- **Signalement** (« réponse douteuse », ou « Signaler une erreur » après la réponse, avec une raison
  facultative) : la question est listée dans Mes résultats et **écartée de tous les tirages**
  (`activeQuestions`) tant que la fiche donne la réponse vue au moment du signalement ; elle revient
  seule si la fiche est corrigée, ou quand le signalement est retiré. « Envoyer mes signalements »
  produit un fichier (version, empreinte des fiches, question, réponse vue, raison) que
  `pnpm signalements <fichier>` met en regard des fiches actuelles. Si une adresse est réglée
  (`REPORT_EMAIL`, vide par défaut), « Envoyer par e-mail » ouvre en plus un e-mail prérempli.
- **Fiabilité** : chaque question porte une pastille verte (vérifiée), orange (à recouper) ou rouge
  (douteuse) ; hors du vert, la note s'affiche après la réponse.

### Test blanc chronométré

20 minutes (`TEST_DURATION_MIN`) calculées depuis une échéance fixe, donc justes même si l'app passe en
arrière-plan. À l'échéance, les questions restantes comptent fausses dans la note, sans toucher leur
progression (elles n'ont pas été vues).

### Cartes mémoire

Type `card` : recto, verso, explication facultative. Auto-évaluation « Je savais / Pas encore », qui
passe par les mêmes règles de niveau que les QCM.

### Maîtrise

Une question est maîtrisée à partir du niveau 3. Le pourcentage affiché est calculé sur toutes les
questions du programme.

Comme il faut au moins trois bonnes réponses sur trois jours pour y arriver, la progression par thème
(Mes résultats) montre trois étapes dans la même barre : **maîtrisées** (niveau 3 et plus), **en cours**
(niveau 1 ou 2, déjà réussies) et **vues** (répondues, pas encore réussies), sur le total du thème.
L'anneau de l'accueil ajoute les questions en cours dans un arc plus clair. La barre avance donc dès les
premières bonnes réponses, tests blancs compris.

## Sauvegarde

- Clé `envol-v2` dans le `localStorage` de l'app installée.
- Tout ce qui est lu (au démarrage ou à l'import) passe par `validateSave` : types, bornes, cohérence
  (`correct ≤ seen`, `correct ≤ total`, date d'examen réelle…). Un fichier est accepté en entier ou
  refusé en entier, et seuls les champs connus sont recopiés.
- Avant un import, l'état courant est gardé (`envol-v2-before-import`) : « Annuler le dernier import ».
- Une sauvegarde illisible au démarrage est mise de côté (`envol-v2-corrupt`), l'app repart et le dit.
- Une écriture refusée par le téléphone (stockage plein) est signalée sur l'accueil.

## Évolutions possibles

- **Choisir ses thèmes** depuis l'accueil.
- **Images dans l'énoncé des questions** (aujourd'hui, les images ne s'affichent que dans l'extrait du cours).

## Fiches

JSON, un fichier par thème, un `id` stable par question (voir `docs/technique.md`). Les ids stables évitent
qu'une correction de faute remette la progression à zéro, ce que faisait l'ancien format texte
(l'identifiant y était calculé à partir du texte).

## Hors ligne

`sw.js` met en cache, à l'installation, tous les fichiers de l'app (liste `ASSETS`) et toutes les
fiches listées dans `index.json`, directement depuis le serveur (sans le cache HTTP du navigateur).

Tout est servi **depuis la copie du téléphone d'abord** : l'app s'ouvre tout de suite, sans réseau
comme avec un réseau très lent (métro, Wi-Fi d'hôtel), où une stratégie « réseau d'abord » attendait
chaque fichier l'un après l'autre.
- **Code** : uniquement la copie. Une nouvelle version arrive par un nouveau `sw.js` (numéro de version),
  qui retélécharge tout ; le bandeau « Nouvelle version » propose de recharger. Deux versions ne se
  mélangent jamais, mais toute modification du code demande un nouveau numéro.
- **Fiches et images** : la copie, puis une mise à jour en arrière-plan pour l'ouverture suivante.

Un test vérifie que `ASSETS` correspond exactement aux fichiers publiés, et un autre que le code est
servi sans attendre un réseau qui ne répond pas.

## Navigation

- **Bouton retour** (Android, navigateur) : chaque écran autre que l'accueil garde une entrée
  d'historique. Retour ferme la fenêtre ouverte, quitte la séance (en test blanc, après confirmation)
  ou fait comme le bouton ✕ de l'écran. Depuis l'accueil, retour quitte l'app.
- **Confirmations** : dans une fenêtre de l'app (`<dialog>`), jamais `confirm()` du navigateur. Un
  test navigateur échoue si une fenêtre du navigateur s'ouvre.

## Sécurité

- **Aucune donnée ne sort du téléphone** : pas de serveur, pas d'analytics, pas de ressource externe.
  La CSP (`<meta http-equiv="Content-Security-Policy">`, GitHub Pages ne permettant pas les en-têtes)
  n'autorise que les fichiers du site ; `referrer: no-referrer`. Pas de script inline : tout est dans `js/`.
- **Texte affiché** : tout ce qui vient des fiches ou d'une sauvegarde passe par `esc()`.
- **Import** : taille plafonnée à 2 Mo (vérifiée avant lecture), validation complète, identifiants
  de questions contrôlés, champs inconnus ignorés.
- **CI** : actions figées sur un commit, jeton en lecture seule sauf pour le job de déploiement
  (`pages: write`, `id-token: write`), identifiants git non conservés, déploiement seulement depuis `main`.
- **Origine partagée** : tous les sites GitHub Pages d'un même compte partagent l'origine
  `<compte>.github.io`, donc le `localStorage` (≈ 5 Mo) et le cache hors ligne. Tant que les autres sites
  Pages du compte sont sous contrôle du même propriétaire, ce n'est pas un risque de sécurité ; en revanche un autre site du
  compte qui viderait tous les caches ou remplirait le stockage toucherait Envol. Les clés d'Envol
  sont préfixées `envol-` et son service worker ne supprime que ses propres caches.
- **Limite connue** : l'anti-clickjacking (`frame-ancestors`) ne peut pas être posé sans en-tête HTTP ;
  sans action sensible ni donnée secrète dans l'app, le risque est négligeable.

## Écriture

Interface en français, **neutre** : aucune marque de genre et pas d'écriture inclusive (« On décolle ? »,
« quand tu veux »). Un test navigateur vérifie l'absence de « prête ». Code en anglais.

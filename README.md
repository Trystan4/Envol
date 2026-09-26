# Envol

Application de révision par QCM pour préparer le métier d'hôtesse ou de steward, pensée pour iPhone,
qui fonctionne hors ligne. Hébergée sur GitHub Pages, sans serveur ni compte.

- **Réviser** : séances de 20 questions tirées au sort, avec plus de chances pour les questions ratées
  ou à revoir. Une question ratée revient un peu plus loin dans la même séance.
- **Test blanc** : 20 questions couvrant tous les thèmes en proportion, notées sur 20, chronométré
  (20 minutes, désactivable dans Réglages).
- **Revoir mes erreurs** : une séance faite uniquement des questions ratées ces 14 derniers jours
  (et pas encore maîtrisées) et des questions marquées « à revoir ».
- **Drapeau** (⚑ en haut de chaque question) : l'utilisatrice marque une question « à revoir »
  (elle tombera plus souvent) ou « réponse douteuse » (listée dans Mes résultats, avec un bouton
  « Envoyer la liste » pour que les fiches soient corrigées).
- **Cartes mémoire** : en plus des QCM, des fiches recto/verso ; on retourne la carte et on se note.
- **Mes résultats** : maîtrise globale et par thème, série de jours et calendrier des 4 dernières
  semaines, historique et tendance des tests blancs, réponses douteuses signalées.
- **Sauvegarde** : progrès gardés automatiquement sur le téléphone, copie exportable et réimportable,
  import annulable ; rappel sur l'accueil après 7 jours sans copie.
- **Réglages** : date d'examen. Le rythme des nouvelles questions s'y adapte pour que tout soit vu
  trois jours avant.

Le fonctionnement du moteur de tirage est expliqué dans [docs/conception.md](docs/conception.md).

## Installer sur iPhone

1. Ouvrir le lien de l'app dans **Safari**.
2. Toucher **Partager**, puis **Sur l'écran d'accueil**, puis **Ajouter**.
3. Toujours ouvrir Envol depuis son icône : c'est là que la progression est gardée.
   La progression de Safari et celle de l'icône sont séparées.

## Visibilité

Le dépôt est public : le code et les fiches sont lisibles sur GitHub par qui les cherche.
L'app demande aux moteurs de recherche de ne pas l'indexer (`<meta name="robots" content="noindex">`),
donc en pratique on n'y arrive que par le lien. Un `robots.txt` ne servirait à rien ici : pour un site
`<compte>.github.io/Envol/`, les robots ne lisent que celui de la racine du domaine.

## Les fiches

Les questions sont dans `src/fiches/` : un fichier `index.json` qui liste les thèmes, puis un fichier
par thème.

```json
{
  "questions": [
    {
      "id": "securite-001",
      "question": "Lors d'une dépressurisation, que fait le PNC en premier ?",
      "answers": [
        { "text": "Il met son propre masque à oxygène", "correct": true },
        { "text": "Il aide d'abord les passagers", "correct": false }
      ],
      "explanation": "On se protège d'abord : sans oxygène, on ne peut aider personne."
    }
  ]
}
```

- **`id` ne change jamais une fois publié** : la progression y est attachée. On peut corriger le
  texte d'une question ou d'une réponse sans rien perdre. Un nouvel `id` = une nouvelle question.
- Plusieurs `"correct": true` : question à choix multiples (l'app l'indique).
- `explanation` est facultative ; elle s'affiche après la réponse en révision.
- Carte mémoire : `{ "id": "vocabulaire-001", "type": "card", "question": "Recto", "answer": "Verso" }`.
- Nouveau thème : créer `src/fiches/<theme>.json` et l'ajouter dans `index.json`.
- Vérifier avant de publier : `pnpm check:deck` (la CI refuse de toute façon une fiche mal formée).

**Les questions actuelles sont des questions de test.** Pour les vraies fiches, quel que soit leur
format d'origine, on les convertit en JSON avec un script. Si elles arrivent sous forme de texte,
`tools/txt-to-json.mjs` convertit ce format :

```
# Thème
Q: La question
+ Une bonne réponse
- Une mauvaise réponse
> Explication (facultatif)
```

`node tools/txt-to-json.mjs mes-fiches.txt src/fiches` puis `pnpm check:deck`.
Remplacer les questions de test repart de zéro pour la progression : à faire avant que l'app serve pour de vrai.

## Développer

Prérequis : Node 22 ou plus et pnpm.

```sh
pnpm install                               # uniquement pour les tests navigateur (Playwright)
pnpm exec playwright install chromium webkit
pnpm serve                                 # l'app sur http://localhost:8000
pnpm verify                                # fiches + tests unitaires + parcours navigateur
```

Sous Windows, un double-clic sur `tools/lancer.bat` lance l'app en local.

| Commande | Ce qu'elle vérifie |
| --- | --- |
| `pnpm check:deck` | Chaque fiche : ids uniques, au moins une bonne et une mauvaise réponse, champs présents |
| `pnpm test` | Moteur, stockage, import/export, fiches, liste hors ligne (Node, sans dépendance) |
| `pnpm test:e2e` | Parcours complets dans Chromium et WebKit (moteur de Safari) : révision, test blanc, sauvegarde, réglages, hors ligne ; chaque écran sur 6 tailles (iPhone SE à iPad, paysage) sans défilement horizontal, boutons ≥ 44 px, aucune violation de sécurité (CSP) |

### Arborescence

```
src/                  ce qui est publié, tel quel (aucune étape de build)
  index.html          squelette de la page
  css/                tokens (couleurs), base, composants, écrans
  js/config.js        tous les réglages du moteur (tailles, intervalles, poids)
  js/engine.js        poids des questions et tirage pondéré
  js/storage.js       sauvegarde, validation, import/export
  js/deck.js          lecture et validation des fiches
  js/summary.js       chiffres des écrans de résultats
  js/app.js           démarrage et actions
  js/screens/         un fichier par écran
  fiches/             les questions
  sw.js               fonctionnement hors ligne
tests/unit/           tests Node (node --test)
tests/e2e/            tests navigateur (Playwright)
tools/                serveur local, vérification et conversion des fiches
docs/conception.md    fonctionnement du moteur et choix techniques
```

## Déploiement

Le workflow `.github/workflows/pages.yml` teste chaque push et chaque pull request. Sur `main`, il
publie `src/` sur GitHub Pages **seulement si tous les tests passent**.

Réglage à faire une seule fois : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

Le dépôt étant public, les minutes GitHub Actions sont gratuites et ne consomment aucun quota. Seul un
compte verrouillé pour un **paiement en échec** bloquerait les workflows (message « recent account
payments have failed… ») : régler le problème dans Settings → Billing and plans, ou, en attendant,
publier via Cloudflare Pages (dépôt connecté, commande de build vide, dossier de sortie `src`), qui
n'utilise pas GitHub Actions.
Laisser « Enforce HTTPS » coché : l'iPhone en a besoin pour l'installation et le hors ligne.

Après un déploiement, l'app récupère la nouvelle version à la prochaine ouverture avec internet
(fermer complètement l'app puis la rouvrir). GitHub peut garder l'ancienne version en cache jusqu'à
une dizaine de minutes.

## Sauvegardes et dépannage

- La progression vit dans l'app installée sur le téléphone, ni dans Safari ni sur GitHub.
  Faire **Sauvegarde → Enregistrer une copie** de temps en temps (par exemple par message).
- Changement de téléphone : installer l'app, puis **Reprendre depuis une copie**.
  **Annuler le dernier import** remet l'état d'avant si la copie n'était pas la bonne.
- Un fichier qui n'est pas une sauvegarde Envol valide est refusé en entier, rien n'est modifié.
- Si la sauvegarde du téléphone est abîmée, l'app repart de zéro et le signale ; l'ancienne version
  est mise de côté (`envol-v2-corrupt`) au lieu d'être effacée.
- « Les fiches ne sont pas encore là » : ouvrir l'app une fois avec internet.
- Les copies exportées (`envol-sauvegarde-*.json`) sont ignorées par Git : ne jamais les publier.

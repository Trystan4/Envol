# Envol : notes techniques

PWA en HTML, CSS et JavaScript, sans dépendance ni étape de build : `src/` est publié tel quel sur
GitHub Pages. Le fonctionnement du moteur est décrit dans [conception.md](conception.md).

## Développer

Prérequis : Node 22 ou plus et pnpm.

```sh
pnpm install                               # uniquement pour les tests navigateur (Playwright)
pnpm exec playwright install chromium webkit
pnpm serve                                 # l'app sur http://localhost:8000
pnpm verify                                # fiches + tests unitaires + parcours navigateur
```

| Commande | Ce qu'elle vérifie |
| --- | --- |
| `pnpm check:deck` | Chaque fiche : ids uniques, au moins une bonne et une mauvaise réponse, extraits, fiabilité |
| `pnpm test` | Moteur, plan du jour, stockage, import/export, fiches, liste hors ligne, poids de l'app (Node, sans dépendance) |
| `pnpm test:e2e` | Parcours complets dans Chromium et WebKit (moteur de Safari) : révision, test blanc, signalement, sauvegarde, réglages, hors ligne ; chaque écran sur 6 tailles (iPhone SE à iPad, paysage) sans défilement horizontal, boutons ≥ 44 px, aucune violation de sécurité (CSP) |
| `pnpm signalements <fichier>` | Affiche un fichier de signalements envoyé depuis l'app à côté des fiches actuelles |

Avant de publier, lancer aussi `pnpm exec playwright test --repeat-each=3` : certains parcours
tirent des questions au hasard.

### Arborescence

```
src/                  ce qui est publié, tel quel (aucune étape de build)
  index.html          squelette de la page
  css/                tokens (couleurs), base, composants, écrans
  js/config.js        tous les réglages du moteur (tailles, intervalles, poids) et la version
  js/engine.js        poids des questions, tirage pondéré, plan du jour
  js/storage.js       sauvegarde, validation, import/export
  js/deck.js          lecture et validation des fiches, empreinte des fiches
  js/summary.js       chiffres des écrans de résultats, fichier de signalements
  js/app.js           démarrage, actions, mises à jour
  js/screens/         un fichier par écran
  fiches/             les questions
  img/                schémas du cours (WebP)
  sw.js               fonctionnement hors ligne
tests/unit/           tests Node (node --test)
tests/e2e/            tests navigateur (Playwright)
tools/                serveur local, vérification et conversion des fiches, signalements
```

## Format des fiches

`src/fiches/index.json` liste les thèmes (`id`, `title`, `file`). Chaque fichier de thème :

```json
{
  "document": "Cours de météo",
  "fiabilite": "verifiee",
  "questions": [
    {
      "id": "meteo-001",
      "question": "Qu'est-ce qu'un nuage ?",
      "answers": [
        { "text": "Un ensemble visible de gouttelettes d'eau ou de cristaux de glace", "correct": true },
        { "text": "Un ensemble visible de vapeur d'eau à l'état gazeux", "correct": false }
      ],
      "page": 3,
      "excerpt": { "text": "Un nuage est un ensemble visible…" }
    }
  ]
}
```

| Champ | Rôle |
| --- | --- |
| `id` | Identifiant définitif (minuscules, chiffres, tirets). **Ne jamais le changer une fois publié.** |
| `answers` | Au moins une bonne et une mauvaise réponse ; plusieurs bonnes = choix multiples |
| `explanation` | Texte affiché après la réponse (facultatif) |
| `type: "card"` + `answer` | Carte mémoire (recto / verso), on se note soi-même |
| `page`, `excerpt` | Page du document source et passage affiché après une erreur : `text`, `table` (`caption`, `head`, `rows`) et/ou `image` (`src` : `img/nom.webp`, `alt`) |
| `fiabilite` | Au niveau du fichier : niveau par défaut. Par question : `{ "niveau": "a_recouper" \| "douteuse", "note": "pourquoi" }` (pastille orange ou rouge, note affichée après la réponse) |
| `a_verifier: true` | Question gardée hors de l'app (listée par `pnpm check:deck`) |

Toute image ajoutée va dans `src/img/` (WebP, 80 Ko au plus, un test le vérifie) et dans la liste
`ASSETS` de `src/sw.js`.

## Versions et mises à jour

La version est écrite à trois endroits, qui doivent rester égaux (un test le vérifie) : `version` de
`package.json`, `APP_VERSION` de `src/js/config.js`, `VERSION` de `src/sw.js`. **L'augmenter à chaque
déploiement** : c'est ce qui fait installer la nouvelle version aux téléphones et afficher le bandeau
« Nouvelle version d'Envol installée ».

Réglages affiche « Version x.y.z · fiches abc123 · N questions ». L'empreinte `fiches` change dès
qu'une question ou une réponse change : elle identifie exactement les fiches d'un téléphone, et elle
est écrite dans les fichiers de signalements.

## Signalements

1. Dans l'app, on signale une question (après la réponse, ou par le drapeau ⚑), avec une raison facultative.
   La question n'est plus posée tant que la fiche donne la même réponse.
2. Mes résultats → **Envoyer mes signalements** : un fichier `envol-signalements-AAAA-MM-JJ.json`.
3. `pnpm signalements envol-signalements-….json` : chaque question signalée, sa raison, et la fiche
   actuelle (choix, extrait), avec une alerte si elle a changé depuis.
4. Corriger la fiche puis déployer : la question revient d'elle-même dans les séances.

## Déploiement

Le workflow `.github/workflows/pages.yml` teste chaque push et chaque pull request. Sur `main`, il
publie `src/` sur GitHub Pages **seulement si tous les tests passent**.

Réglage à faire une seule fois : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
Laisser « Enforce HTTPS » coché : l'installation et le hors ligne en ont besoin.

Le dépôt étant public, les minutes GitHub Actions sont gratuites. Seul un compte verrouillé pour un
**paiement en échec** bloquerait les workflows : régler le problème dans Settings → Billing and plans,
ou publier en attendant via Cloudflare Pages (dépôt connecté, commande de build vide, dossier de
sortie `src`).

Après un déploiement, l'app installée trouve la nouvelle version à sa prochaine ouverture avec
internet (ou via Réglages → Rechercher une mise à jour). GitHub peut garder l'ancienne version en
cache une dizaine de minutes.

## Visibilité

Le dépôt est public : le code et les fiches sont lisibles sur GitHub par qui les cherche. L'app
demande aux moteurs de recherche de ne pas l'indexer (`<meta name="robots" content="noindex">`), donc
en pratique on n'y arrive que par le lien. Un `robots.txt` ne servirait à rien : pour un site
`<compte>.github.io/Envol/`, les robots ne lisent que celui de la racine du domaine.

## Sauvegardes et dépannage

- La progression vit dans l'app installée sur l'appareil, pas sur GitHub. Faire **Sauvegarde →
  Enregistrer une copie** de temps en temps ; l'accueil le rappelle après 7 jours sans copie.
- Changement de téléphone : installer l'app, puis **Reprendre depuis une copie**. **Annuler le dernier
  import** remet l'état d'avant si la copie n'était pas la bonne.
- Un fichier qui n'est pas une sauvegarde Envol valide est refusé en entier, rien n'est modifié.
- Si la sauvegarde du téléphone est abîmée, l'app repart de zéro et le signale ; l'ancienne version
  est mise de côté (`envol-v2-corrupt`) au lieu d'être effacée.
- Sur iPhone, la progression dans Safari et celle de l'app installée sont séparées.
- « Les fiches ne sont pas encore là » : ouvrir l'app une fois avec internet.
- Les copies exportées (`envol-sauvegarde-*.json`) sont ignorées par Git : ne jamais les publier.

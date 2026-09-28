# CLAUDE.md — Envol

Application de révision par QCM installable sur n'importe quel appareil (PWA hors ligne), publiée sur GitHub Pages depuis un
dépôt public. Lire `README.md`, `docs/technique.md` et `docs/conception.md` avant toute modification du moteur.

## Règles

- **Aucun co-auteur dans les commits.** Pas de ligne `Co-Authored-By`, pas de mention d'outil.
  Ne pas committer ni pousser sans demande : le propriétaire du dépôt pousse lui-même sur `main`.
- **Zéro dépendance de production, aucune étape de build.** `src/` est publié tel quel. Playwright est
  la seule dépendance de développement ; toute autre s'ajoute sur demande explicite.
- **Langue** : interface et documentation en français, code en anglais (identifiants, fichiers, commentaires).
- **Interface neutre** : aucune marque de genre, pas d'écriture inclusive.
- **Rien d'indexable** : garder `<meta name="robots" content="noindex, …">` dans `src/index.html`.
- **CSP stricte** : aucun script inline ni ressource externe (CDN, police, analytics). Les tests
  `tests/e2e/responsive.spec.js` échouent sur toute violation.
- Toute modification publiée du code demande un **nouveau numéro de version** (`package.json`,
  `config.js`, `sw.js`) : le code est servi depuis la copie du téléphone, sinon il n'arrive jamais.
- Ne jamais changer l'`id` d'une question publiée, ni la clé `envol-v2` sans migration : la
  progression y est attachée.

## Où placer quoi

| Besoin | Fichier |
| --- | --- |
| Un réglage du moteur (taille, intervalle, poids) | `src/js/config.js` |
| Le choix des questions | `src/js/engine.js` |
| Sauvegarde, import, export | `src/js/storage.js` |
| Validation des fiches | `src/js/deck.js` |
| Une couleur | `src/css/tokens.css` |
| Un texte d'écran | `src/js/screens/<écran>.js` |
| Une question | `src/fiches/<thème>.json` |

`engine`, `storage`, `deck` et `summary` restent purs (pas de DOM, temps et aléatoire en paramètre).
Tout texte dynamique affiché passe par `esc()`.

Tout nouveau fichier dans `src/` doit être ajouté à `ASSETS` dans `src/sw.js` (un test le vérifie).

## Vérifier

```sh
pnpm check:deck && pnpm test && pnpm test:e2e   # ou : pnpm verify
```

La CI (`.github/workflows/pages.yml`) lance les mêmes commandes et ne déploie `src/` que si tout passe.

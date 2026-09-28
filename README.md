# Envol

Une app de révision par QCM, pensée pour le téléphone. Elle fonctionne sans internet une fois
installée, sans compte ni publicité, et la progression reste sur l'appareil. Elle marche avec
n'importe quelles fiches : voir [Créer ses propres fiches](#créer-ses-propres-fiches).

## Ce que fait l'app

- **Cours** : les passages du cours, thème par thème, avec une recherche dans tous les thèmes.
- **Réviser** : des séances de 20 questions (ou une séance express de 5). Une question ratée ne
  revient pas dans la même séance, mais plus souvent aux séances suivantes ; celles qu'on maîtrise
  s'espacent.
- **Plan de révision** : avec une date d'examen (dans Réglages), l'app dose les nouvelles questions
  pour que tout soit vu trois jours avant, dit combien de séances faire par jour et montre la
  progression du jour.
- **Test blanc** : 20 questions sur tous les thèmes, notées sur 20, chronométrées (désactivable).
  Une erreur en test blanc pèse plus qu'en révision : la question repart de zéro.
- **Revoir mes erreurs** : une séance faite des questions ratées récemment.
- **Après une erreur**, l'extrait du cours s'affiche avec sa page (texte, tableau ou schéma).
- **Signaler une erreur** dans une question, avec une raison : elle n'est plus posée tant qu'elle
  n'est pas corrigée, et Mes résultats permet d'envoyer la liste des signalements.
- **Pastille de fiabilité** sur chaque question : verte (vérifiée dans le document), orange (à
  recouper avec ses sources) ou rouge (douteuse).
- **Mes résultats** : progression par thème en trois étapes, vues, en cours et maîtrisées (et
  « Réviser ce thème »), questions les plus ratées, date où
  tout sera découvert, jours de révision, notes des tests blancs.
- **Reprendre une séance** interrompue (app fermée en pleine séance).
- **Affichage** : texte agrandi, thème clair ou sombre au choix.
- **Comment marche Envol** : un guide des fonctionnalités, dans Réglages.
- **Bouton retour** du téléphone : il revient à l'écran précédent de l'app au lieu de la quitter.
- **Sauvegarde** : une copie de la progression à garder de côté, pour changer de téléphone.
- **Mises à jour** : un bandeau propose la nouvelle version quand elle arrive ; l'accueil annonce les
  questions nouvelles ou corrigées, et les questions signalées qui ont été corrigées.

## L'installer sur son téléphone

Ouvrir le lien de l'app, puis :

| Appareil | Étapes |
| --- | --- |
| iPhone / iPad | Dans **Safari** : **Partager** → **Sur l'écran d'accueil** → **Ajouter** |
| Android | Dans **Chrome** : menu **⋮** → **Installer l'application** |
| Ordinateur | **Chrome** ou **Edge** : icône d'installation dans la barre d'adresse |

Ensuite, toujours ouvrir Envol depuis son icône : c'est là que la progression est gardée.

## La lancer sur son ordinateur

Il faut [Node.js](https://nodejs.org) (version 22 ou plus). Télécharger le dépôt, puis :

- **Windows** : double-clic sur `tools/lancer.bat` ;
- **Mac / Linux** : `sh tools/lancer.sh`.

L'app s'ouvre dans le navigateur sur http://localhost:8000. Rien n'est envoyé nulle part.

## Créer ses propres fiches

Les questions sont dans `src/fiches/` : `index.json` liste les thèmes, puis un fichier par thème.
Le plus simple est de les écrire en texte :

```
# Mon thème
Q: La question
+ Une bonne réponse
- Une mauvaise réponse
- Une autre mauvaise réponse
> Explication affichée après la réponse (facultatif)
```

puis de les convertir et de les vérifier :

```sh
node tools/txt-to-json.mjs mes-fiches.txt src/fiches
pnpm check:deck
```

Bon à savoir :

- **L'`id` d'une question ne change plus une fois publié** : la progression y est attachée.
  Corriger le texte ne fait rien perdre ; un nouvel `id` est une nouvelle question.
- Plusieurs bonnes réponses : l'app en fait une question à choix multiples.
- Dans le JSON, une question peut aussi avoir une `page` et un `excerpt` (le passage du cours
  affiché après une erreur : `text`, `table` ou `image`), une `fiabilite`, ou être une carte mémoire
  (`"type": "card"`). Tous les champs sont décrits dans [docs/technique.md](docs/technique.md).
- De bonnes mauvaises réponses : de la même forme que la bonne (longueur, format), fausses d'après
  le cours, et sans mot qui trahit (« uniquement », « jamais »…).

Pour publier sa propre version en ligne, gratuitement, voir [docs/technique.md](docs/technique.md).

## Pour aller plus loin

- [docs/technique.md](docs/technique.md) : développement, tests, déploiement, sauvegardes et dépannage.
- [docs/conception.md](docs/conception.md) : fonctionnement du moteur de révision et choix techniques.

## Licence

Copyright (C) 2026 Trystan4 ([github.com/Trystan4](https://github.com/Trystan4)).

Le code et la documentation d'Envol sont publiés sous licence
[GNU Affero General Public License v3.0](LICENSE) ou toute version ultérieure (AGPL-3.0-or-later).
Toute version modifiée, y compris proposée en ligne, doit publier son code source sous la même licence.

Le contenu des fiches (`src/fiches/`) et les images qu'elles citent (`src/img/`) **ne sont pas couverts**
par cette licence : ils reprennent des documents de cours qui restent la propriété de leurs auteurs.

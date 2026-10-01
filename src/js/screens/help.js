import { closeBar } from "./common.js";

// "Comment marche Envol": every feature in a few words, reached from Réglages.
const SECTIONS = [
  ["Réviser", "Des séances de 20 questions. Une question ratée ne revient pas dans la même séance, mais plus souvent aux séances suivantes ; celles que tu maîtrises s'espacent."],
  ["Le plan du jour", "Avec une date d'examen (dans Réglages), Envol dose les nouvelles questions pour que tout soit vu trois jours avant. L'accueil dit combien de questions faire aujourd'hui et en combien de séances ; la barre montre où tu en es."],
  ["Test blanc", "20 questions sur tous les thèmes, notées sur 20, en 20 minutes (le chrono se désactive dans Réglages). Une erreur y pèse plus qu'en révision : la question repart de zéro et revient souvent pendant trois jours. Une bonne réponse compte comme en révision."],
  ["Revoir mes erreurs", "Une séance faite des questions ratées ces derniers jours et de celles marquées « à revoir » avec le drapeau ⚑."],
  ["Mes résultats", "La courbe de ta maîtrise jour après jour ; les thèmes du plus fragile au plus solide, en trois étapes : vues, en cours (déjà réussies) et maîtrisées (réussies plusieurs fois, sur plusieurs jours), avec « Réviser ce thème » ; les questions les plus ratées, tes jours de révision, la courbe de tes notes de test blanc et la date où tout sera découvert."],
  ["Cours", "En haut de l'accueil : les passages du cours, thème par thème, et une recherche dans tous les thèmes. Pour apprendre avant de te tester."],
  ["Après une erreur", "L'extrait du cours s'affiche avec sa page : le texte, le tableau ou le schéma qui donne la bonne réponse."],
  ["La pastille", "À côté du thème, une pastille dit si la réponse est sûre. Verte et pleine : vérifiée dans le cours. Orange et vide : à recouper avec tes sources. Rouge et cerclée : douteuse. Touche-la pour en savoir plus."],
  ["Signaler une erreur", "Après ta réponse, « Signaler une erreur dans cette question », avec la raison si tu veux. Elle ne te sera plus posée tant qu'elle n'est pas corrigée. Envoie tes signalements depuis Mes résultats."],
  ["Reprendre une séance", "Si l'app se ferme en pleine séance, l'accueil propose de la reprendre à la question suivante."],
  ["Sauvegarde", "Ta progression reste sur cet appareil. Fais une copie de temps en temps (Sauvegarde) : elle permet de tout retrouver sur un autre téléphone."],
  ["Changer d'appareil", "Dans Sauvegarde, sans fichier ni internet : « Envoyer par QR code » sur l'ancien appareil, « Recevoir par QR code » sur le nouveau, puis vise les codes qui défilent. Rien n'est remplacé sans ton accord, et « Annuler le dernier import » remet l'état d'avant."],
  ["Tablette et ordinateur", "Tourne la tablette ou le téléphone : la question se place à gauche, les réponses à droite. Au clavier, les touches 1 à 9 choisissent une réponse et Entrée valide ou passe à la suite."],
  ["Hors ligne et mises à jour", "Une fois installée, l'app marche sans internet. Quand une nouvelle version arrive, un bandeau propose de mettre à jour."],
];

export function renderHelp() {
  return `<main class="screen wide">
    ${closeBar("settings")}
    <h1 class="title">Comment marche Envol</h1>
    <div class="help">${SECTIONS.map(([title, text]) => `<section class="card"><h2>${title}</h2><p>${text}</p></section>`).join("")}</div>
  </main>`;
}

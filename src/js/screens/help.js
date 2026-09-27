import { closeBar } from "./common.js";

// "Comment marche Envol": every feature in a few words, reached from Réglages.
const SECTIONS = [
  ["Réviser", "Des séances de 20 questions. Une question ratée revient un peu plus loin dans la séance, puis plus souvent les jours suivants ; celles que tu maîtrises s'espacent."],
  ["Le plan du jour", "Avec une date d'examen (dans Réglages), Envol dose les nouvelles questions pour que tout soit vu trois jours avant. L'accueil dit combien de questions faire aujourd'hui et en combien de séances ; la barre montre où tu en es."],
  ["Test blanc", "20 questions sur tous les thèmes, notées sur 20, en 20 minutes (le chrono se désactive dans Réglages). Une erreur y compte comme en révision : la question reviendra plus souvent."],
  ["Revoir mes erreurs", "Une séance faite des questions ratées ces derniers jours et de celles marquées « à revoir » avec le drapeau ⚑."],
  ["Mes résultats", "La maîtrise par thème (avec « Réviser ce thème »), les questions les plus ratées, tes jours de révision, tes notes de test blanc et la date où tout sera découvert."],
  ["Cours", "En haut de l'accueil : les passages du cours, thème par thème, et une recherche dans tous les thèmes. Pour apprendre avant de te tester."],
  ["Après une erreur", "L'extrait du cours s'affiche avec sa page : le texte, le tableau ou le schéma qui donne la bonne réponse."],
  ["La pastille", "À côté du thème, une pastille dit si la réponse est sûre. Verte : vérifiée dans le cours. Orange : à recouper avec tes sources. Rouge : douteuse. Touche-la pour en savoir plus."],
  ["Signaler une erreur", "Après ta réponse, « Signaler une erreur dans cette question », avec la raison si tu veux. Elle ne te sera plus posée tant qu'elle n'est pas corrigée. Envoie tes signalements depuis Mes résultats."],
  ["Reprendre une séance", "Si l'app se ferme en pleine séance, l'accueil propose de la reprendre à la question suivante."],
  ["Sauvegarde", "Ta progression reste sur cet appareil. Fais une copie de temps en temps (Sauvegarde) : elle permet de tout retrouver sur un autre téléphone."],
  ["Hors ligne et mises à jour", "Une fois installée, l'app marche sans internet. Quand une nouvelle version arrive, un bandeau propose de mettre à jour."],
];

export function renderHelp() {
  return `<main class="screen">
    ${closeBar("settings")}
    <h1 class="title">Comment marche Envol</h1>
    <div class="help">${SECTIONS.map(([title, text]) => `<section class="card"><h2>${title}</h2><p>${text}</p></section>`).join("")}</div>
  </main>`;
}

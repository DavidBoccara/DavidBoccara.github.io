// Fenêtre « Nouveautés » (demandée par le propriétaire le 10/11/2026) : montrée à l'ouverture de l'appli, puis plus jamais
// sur cet appareil une fois fermée (clé `news_seen` = NEWS.id, quelle que soit la façon de la fermer). Elle attend qu'aucune
// autre fenêtre ne soit ouverte (engagement photo, position, mise à jour…) et ne s'ouvre pas sur l'écran de connexion.
// Pour annoncer d'autres nouveautés : changer NEWS (nouvel id + éléments) et traduire les textes dans en.js et es.js.
import { h, ls, icon, rankIcon, modal } from "./util.js";

export const NEWS = {
  id: "2026-11-grades",
  // [icône, titre, une ligne]
  items: [
    [() => rankIcon(5, 22), "Des grades à mériter",
      "Pour monter, il faut des XP, des modèles photographiés et des likes reçus. Chaque grade a son insigne et sa couleur."],
    [() => icon("heart", 22), "Les likes rapportent des XP",
      "Jusqu'à 8 XP par like, selon le grade de celui qui like. Les jeux rapportent moins : les photos comptent plus."],
    [() => icon("bell", 22), "Notifications",
      "Likes, commentaires, photos de tes amis, demandes d'ami et concours, dans l'appli Android (1.28)."],
    [() => icon("profile", 22), "Pages des joueurs", "Touche un pseudo pour voir son grade et ses photos."],
  ],
};

function openNews() {
  modal({
    title: "Quoi de neuf dans Plane GO",
    body: h("div.news", NEWS.items.map(([ico, title, text]) =>
      h("div.news-item", h("span.news-ico", ico()), h("div", h("b", title), h("div.dim", text))))),
    onClose: () => ls.set("news_seen", NEWS.id),
    buttons: [
      { label: "Voir les grades", onClick: () => { ls.set("grades_mode", "grades"); location.hash = "#profile/ranking"; } },
      { label: "C'est parti", primary: true },
    ],
  });
}

/** Au lancement : une seule fois, dès qu'aucune autre fenêtre n'est ouverte (nouvel essai toutes les 2 s, 2 min au plus). */
export function showNewsAtStart(tries = 60) {
  if (ls.get("news_seen") === NEWS.id || tries <= 0) return;
  if (document.querySelector(".modal-back") || location.hash.startsWith("#auth")) { setTimeout(() => showNewsAtStart(tries - 1), 2000); return; }
  openNews();
}

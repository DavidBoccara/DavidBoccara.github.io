// Bannière « Bientôt sur le Play Store » (demandée par le propriétaire le 10/11/2026) : annonce l'appli Android complète et
// propose de rejoindre l'équipe de test. « Devenir testeur » → fenêtre (adresse Gmail du Play Store, un mot facultatif) →
// message dans contact_messages (sujet BETA_SUBJECT), lu dans Profil › Admin › Messages (bouton « Donner l'insigne bêta »).
// Cachée sur iPhone (pas de Play Store), dans l'appli installée depuis le Play Store, après une demande (`play_beta_sent`)
// et, dans le Feed, après « Plus tard » (`play_beta_hidden`). À la sortie officielle : passer ON à false.
import { h, ls, icon, modal } from "./util.js";
import { Supa } from "./supa.js";
import { Player } from "./store.js";
import { isIos } from "./app.js";
import { fromPlayStore } from "./native.js";

const ON = true;
export const BETA_SUBJECT = "Équipe de test Play Store";

/** Bannière (null si elle n'a pas lieu d'être). dismissible : bouton « Plus tard » qui la masque (Feed). */
export function playBetaCard({ dismissible = false } = {}) {
  if (!ON || isIos() || fromPlayStore() || ls.get("play_beta_sent") || (dismissible && ls.get("play_beta_hidden"))) return null;
  const card = h("div.card.pad.play-beta",
    h("div.pb-head", h("span.beta-tag", icon("flask", 12)), "Bientôt sur le Play Store"),
    h("b", "Débloque toute la puissance de Plane GO"),
    h("div.small.dim", "Radar à pleine capacité, appareil photo connecté, alertes en direct et bien plus. Teste l'appli Android avant tout le monde et reçois l'insigne Bêta-testeur."),
    h("div.row.mt", { style: { flexWrap: "wrap" } },
      h("button.btn.primary.small", { onclick: () => askToJoin(card) }, "Devenir testeur"),
      dismissible && h("button.btn.small.outline", { onclick: () => { ls.set("play_beta_hidden", Date.now()); card.remove(); } }, "Plus tard")));
  return card;
}

// Ce que l'appli Android apporte en plus du site : [icône, titre, une ligne]
const PERKS = [
  ["radar", "La pleine capacité du radar", "Scan à la seconde et alertes dès qu'un avion rare ou militaire approche."],
  ["usb", "Ton appareil photo connecté", "Branche ton Sony Alpha par câble : la photo arrive dans Plane GO, rangée avec le bon avion."],
  ["bell", "Les notifications", "Likes, commentaires, photos de tes amis et résultats du concours."],
  ["image", "Et bien plus", "Photos enregistrées dans ta galerie, rappel du quiz du jour à 18 h, partage en un geste."],
];

function askToJoin(card) {
  const logged = Supa.isLoggedIn;
  const field = (label, el) => h("label.field", h("span", label), el);
  const name = h("input.input", { maxLength: 80, autocomplete: "nickname" });
  const email = h("input.input", { type: "email", maxLength: 200, autocomplete: "email",
    value: /@(gmail|googlemail)\.com$/i.test(Supa.email) ? Supa.email : "" });
  const note = h("textarea.input", { rows: 3, maxLength: 1000, placeholder: "Ton téléphone, ce que tu aimerais tester…" });
  const status = h("div.small.mt");
  const say = (text) => { status.textContent = text; return false; }; // false : la fenêtre reste ouverte
  modal({
    title: "Rejoindre l'équipe de test",
    body: [
      h("div.news", PERKS.map(([ico, title, text]) => h("div.news-item", h("span.news-ico", icon(ico, 22)), h("div", h("b", title), h("div.dim", text))))),
      h("p.small.mt", "Laisse l'adresse Gmail de ton Play Store : Google ajoute les testeurs avec leur compte Google, et tu recevras le lien pour installer l'appli. En remerciement, l'insigne Bêta-testeur s'affichera à côté de ton pseudo."),
      !logged && field("Prénom ou pseudo", name),
      field("Adresse Gmail du Play Store", email),
      field("Un mot (facultatif)", note),
      status].filter(Boolean),
    buttons: [{ label: "Annuler" }, { label: "Envoyer", primary: true, onClick: async () => {
      const who = (logged ? Player.profile?.username || "Joueur" : name.value).trim(), mail = email.value.trim();
      if (!who) return say("Indique ton prénom ou ton pseudo.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return say("Indique l'adresse e-mail de ton compte Google.");
      say("Envoi…");
      try {
        await Supa.send("contact_messages", { name: who, email: mail, subject: BETA_SUBJECT, page: location.hostname,
          message: ("Je veux faire partie de l'équipe de test.\n\n" + note.value.trim()).trim() });
      } catch { return say("L'envoi n'a pas marché. Réessaie dans quelques minutes."); }
      ls.set("play_beta_sent", Date.now());
      card.replaceChildren(h("b", "Demande envoyée, merci !"), h("div.small.dim", "Tu recevras un e-mail avec le lien de l'appli de test."));
    } }],
  });
}

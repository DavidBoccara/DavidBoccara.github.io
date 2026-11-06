// Plane GO (PWA) : navigation par onglets, HUD du joueur, installation.
import { syncBlocks } from "./blocks.js";
import { LOCALE } from "./i18n.js";
import { $, h, ls, modal, toast, icon } from "./util.js";
import { Supa, emailLink } from "./supa.js";
import { Player } from "./store.js";
import { Sound } from "./sound.js";
import { Cloud, sync } from "./cloud.js";
import { Radar } from "./radar.js";
import { feed } from "./screens/feed.js";
import { scanner } from "./screens/scanner.js";
import { quiz } from "./screens/quiz.js";
import { collection } from "./screens/collection.js";
import { profile } from "./screens/profile.js";
import { aircraftPage } from "./screens/aircraft.js";
import { commentsPage } from "./screens/comments.js";
import { authPage } from "./screens/auth.js";
import { privacyPage } from "./screens/privacy.js";
import { legalPage, termsPage } from "./screens/legal.js";
import { checkAppUpdate } from "./update.js";
import { watchDefaultLocation } from "./ui.js";
import { askPhotoRulesAtStart, syncPhotoRules } from "./photorules.js";
import { noticeRemovals } from "./report.js";
import "./camera.js"; // photos de l'appareil branché par câble : bandeau « Nouvelle photo » sur tous les écrans

// Barre du bas : 5 onglets, le Scanner au centre en bouton surélevé
export const TABS = [
  { id: "feed", icon: "feed", label: "Feed", screen: feed },
  { id: "quiz", icon: "games", label: "Jeux", screen: quiz }, // onglet « Jeux » (adresse #quiz gardée pour les anciens liens)
  { id: "scanner", icon: "radar", label: "Scanner", screen: scanner, center: true },
  { id: "collection", icon: "collection", label: "Collection", screen: collection },
  { id: "profile", icon: "profile", label: "Profil", screen: profile },
];
const PAGES = { ac: aircraftPage, comments: commentsPage, auth: authPage, privacy: privacyPage, legal: legalPage, terms: termsPage };
// Anciennes adresses (onglets regroupés)
const ALIASES = { hangar: "collection/seen", friends: "profile/friends", grades: "profile/ranking" };


// Installation : Chrome affiche sa propre bannière, et on garde l'événement pour nos boutons « Installer »
export const install = { prompt: null };
window.addEventListener("beforeinstallprompt", (e) => {
  install.prompt = e;
  window.dispatchEvent(new Event("planego-installable"));
});
window.addEventListener("appinstalled", () => { install.prompt = null; window.dispatchEvent(new Event("planego-installed")); });
export function isStandalone() { return !!window.PlaneGONative || matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
export function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
export function isAndroid() { return /android/i.test(navigator.userAgent); }

let cleanup = null;
export const go = (route) => { location.hash = "#" + route; };
export const back = () => (history.length > 1 ? history.back() : go("feed"));

function route() {
  const [name, ...rest] = (location.hash.slice(1) || ls.get("last_tab", "feed")).split("/");
  if (ALIASES[name]) { location.replace("#" + ALIASES[name]); return; }
  const tab = TABS.find((t) => t.id === name);
  const page = PAGES[name];
  const view = $("#view");
  cleanup?.(); cleanup = null;
  view.replaceChildren();
  view.scrollTop = 0;
  renderTabs(tab?.id);
  view.dataset.screen = tab ? tab.id : page ? name : ""; // largeur du contenu sur ordinateur (styles.css)
  if (tab) { ls.set("last_tab", tab.id); cleanup = tab.screen(view, rest) || null; }
  else if (page) cleanup = page(view, rest.map(decodeURIComponent)) || null;
  else go("feed");
  renderHud();
}

function renderTabs(current) {
  $("#tabs").replaceChildren(...TABS.map((t) => {
    const b = h("button.tab" + (t.id === current ? ".on" : "") + (t.center ? ".center" : ""), {
      "aria-label": t.label, "aria-current": t.id === current ? "page" : null, onclick: () => go(t.id),
    });
    if (t.center) {
      b.append(h("span.fab", icon("radar", 28)), h("span.l", t.label));
    } else b.append(h("span.e", icon(t.icon, 22)), h("span.l", t.label));
    return b;
  }));
  radarLive();
}

/** Le bouton Scanner pulse tant que le radar tourne. */
function radarLive() { $("#tabs .tab.center")?.classList.toggle("live", Radar.running); }
Radar.subscribe(radarLive);

/** HUD : avatar, pseudo, grade et barre d'XP. */
export function renderHud() {
  const p = Player.profile, xp = Player.bestXp(), lvl = Player.level();
  Sound.level(lvl.number); // fanfare si le grade vient de monter après un gain
  const pct = lvl.nextXp ? ((xp - lvl.minXp) / (lvl.nextXp - lvl.minXp)) * 100 : 100;
  const av = h("img.avatar", { alt: "", src: p?.avatarUrl || "icons/avatar.svg" });
  av.onerror = () => { av.src = "icons/avatar.svg"; };
  $("#hud").replaceChildren(av,
    h("div.who", h("div.name", p?.username || (Supa.isLoggedIn ? "…" : "Invité")),
      h("div.lvl", `Niv. ${lvl.number} · ${lvl.name}`),
      h("div.xpbar", h("i", { style: { width: pct + "%" } }))),
    h("span.chip", `${xp.toLocaleString(LOCALE)} XP`));
  $("#hud").onclick = () => go("profile");
}

/** Écran « connecte-toi » pour les onglets qui demandent un compte. Renvoie true si bloqué. */
export function loginGate(view, text) {
  if (Supa.isLoggedIn) return false;
  view.append(h("div.gate", h("img.gate-logo", { src: "icons/logo.svg", alt: "", width: 120, height: 120 }), h("h2", "Rejoins l'escadrille !"), h("p.dim", text),
    h("button.btn.primary.mt", { onclick: () => go("auth") }, "Se connecter / créer un compte")));
  return true;
}

// ---------- Lien reçu par e-mail ----------
/** Mot de passe oublié → formulaire « Nouveau mot de passe » ; confirmation du compte → connecté ; lien expiré → message. */
export const linkState = { pending: !!emailLink?.access_token };
async function openEmailLink(l) {
  if (l.error) {
    go("auth");
    const expired = /expired|invalid|otp/i.test(l.error + " " + l.code);
    modal({ title: expired ? "Lien expiré ou déjà utilisé" : "Lien invalide", body: expired
      ? "Ce lien n'est plus valable : il ne fonctionne qu'une fois et pendant une heure, et seul le dernier e-mail reçu compte.\n\nTouche « Mot de passe oublié ? » pour recevoir un nouveau lien, puis ouvre-le tout de suite."
      : `Le lien n'a pas pu être utilisé (${l.error}). Redemande un e-mail.` });
    return;
  }
  if (l.type === "recovery") go("auth/reset");
  try {
    await Supa.useEmailLink(l);
  } catch (e) {
    linkState.pending = false;
    go("auth");
    modal({ title: "Lien expiré ou déjà utilisé", body: "Ce lien n'est plus valable. Touche « Mot de passe oublié ? » pour en recevoir un nouveau." });
    return;
  }
  linkState.pending = false;
  if (l.type === "recovery") route();
  else { go("feed"); toast("Adresse e-mail confirmée : bienvenue dans Plane GO !"); }
}

// ---------- Démarrage ----------
window.addEventListener("hashchange", route);
Supa.onChange(async () => {
  Player.profile = null;
  if (Supa.isLoggedIn) { syncPhotoRules(); await sync(); setTimeout(askPhotoRulesAtStart, 1500); }
  if (location.hash !== "#auth/reset") route(); // ne pas effacer le nouveau mot de passe en cours de saisie
});
route();
window.dispatchEvent(new Event("planego-ready")); // premier écran affiché : fin de l'animation d'ouverture (index.html)
if (emailLink) openEmailLink(emailLink);
setTimeout(checkAppUpdate, 3000); // appli Android pas à jour ?
watchDefaultLocation(); // position du téléphone introuvable → fenêtre « ce n'est pas normal »
setTimeout(askPhotoRulesAtStart, 3500); // joueurs déjà inscrits : engagement « photos depuis des lieux publics »
window.addEventListener("planego-synced", noticeRemovals); // une de mes publications supprimée après 5 signalements ?
window.addEventListener("planego-synced", syncBlocks); // joueurs bloqués (blocks.js)
if (Supa.isLoggedIn) {
  Cloud.profile().then((p) => { Player.profile = p; renderHud(); }).catch(() => {});
  sync().then(renderHud);
}

// Service worker : fonctionnement hors ligne et installation
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.open) go(e.data.open); });
}


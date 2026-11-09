// Mesure d'audience : Google Analytics 4 (identifiant GA_ID de config.js), seulement avec l'accord du joueur.
// - Bandeau « Refuser / Accepter » (deux boutons identiques) à la première visite ; choix gardé 6 mois sur l'appareil
//   (clé analytics_consent), puis redemandé. Réglage « Mesure d'audience » du Profil et bouton « Changer mon choix » de la
//   page Confidentialité. En France, Google Analytics n'a pas droit à l'exemption de consentement de la CNIL.
// - Avant l'accord : rien n'est chargé ni envoyé à Google (pas de « mode consentement » qui enverrait des signaux sans cookie).
// - Pages vues envoyées à la main à chaque écran (événement planego-route d'app.js) avec une adresse nettoyée : le nom de
//   l'écran seulement (« /scanner », « /collection/photos »), jamais d'identifiant d'avion, de publication ou de joueur, ni le
//   jeton d'un lien reçu par e-mail. Seuls les paramètres utm_* de l'adresse d'arrivée sont gardés (liens des groupes Facebook).
// - Aucun identifiant de compte envoyé ; signaux Google et personnalisation publicitaire coupés ; cookies de 13 mois au plus.
// - Refus après un accord : envoi coupé tout de suite (ga-disable) et cookies _ga effacés.
import { GA_ID } from "./config.js";
import { h, ls, infoButton } from "./util.js";

const KEY = "analytics_consent";
const VALID_MS = 182 * 86400e3; // choix gardé 6 mois, puis redemandé
const COOKIE_S = 395 * 86400; // 13 mois
// Deuxième morceau de l'adresse gardé (vues des onglets) ; tout le reste est retiré
const VIEWS = new Set(["world", "friends", "contest", "live", "daily", "pass", "practice", "photos", "seen", "catalog", "me", "ranking", "admin", "reset"]);
const UTM = new URLSearchParams([...new URLSearchParams(location.search)].filter(([k]) => /^utm_(source|medium|campaign|content|term)$/.test(k))).toString();

let loaded = false, current = null, lastSent = "", banner = null;

function read() {
  const c = ls.get(KEY, null);
  if (!c || (c.v !== "yes" && c.v !== "no") || !(Date.now() - (c.at || 0) < VALID_MS)) return null;
  return c.v;
}

export const Analytics = {
  /** "yes" (accepté), "no" (refusé) ou null (pas encore répondu, ou choix de plus de 6 mois). */
  get state() { return GA_ID ? read() : "no"; },
  get enabled() { return !!GA_ID; },
  /** Enregistre le choix du joueur et l'applique tout de suite. */
  set(yes) {
    ls.set(KEY, { v: yes ? "yes" : "no", at: Date.now() });
    banner?.remove(); banner = null;
    if (yes) start();
    else stop();
    window.dispatchEvent(new Event("planego-consent"));
  },
  /** Rouvre le bandeau (Confidentialité › « Changer mon choix »). */
  ask() { showBanner(true); },
};

/** Chargement de gtag.js et réglages (seulement après l'accord). */
function start() {
  if (!GA_ID) return;
  window["ga-disable-" + GA_ID] = false;
  if (!loaded) {
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, {
      send_page_view: false, // envoyées à la main, adresse nettoyée
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: COOKIE_S,
      cookie_flags: "SameSite=Lax;Secure",
      page_location: location.origin + "/",
    });
    document.head.append(h("script", { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}` }));
  }
  lastSent = "";
  pageView();
}

/** Refus : plus aucun envoi, cookies de Google Analytics effacés. */
function stop() {
  if (!GA_ID) return;
  window["ga-disable-" + GA_ID] = true;
  const host = location.hostname, parts = host.split(".");
  const domains = ["", host, "." + host];
  for (let i = 1; i < parts.length - 1; i++) domains.push("." + parts.slice(i).join("."));
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (!/^_ga(_|$)|^_gid$|^_gat/.test(name)) continue;
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? "; domain=" + d : ""}`;
  }
}

/** Adresse sans identifiant : « /scanner », « /collection/photos », « /ac » (pas le code de l'avion)… */
function cleanPath(r) {
  if (!r || !/^[a-z]+$/.test(r.name || "")) return "/";
  const sub = r.rest?.[0];
  return "/" + r.name + (sub && VIEWS.has(sub) ? "/" + sub : "");
}

function pageView() {
  if (!loaded || read() !== "yes" || !current) return;
  const path = cleanPath(current);
  if (path === lastSent) return;
  const first = !lastSent;
  lastSent = path;
  window.gtag("event", "page_view", {
    page_location: location.origin + path + (first && UTM ? "?" + UTM : ""),
    page_path: path,
    page_title: path === "/" ? "accueil" : path.slice(1),
  });
}

window.addEventListener("planego-route", (e) => { current = e.detail; pageView(); });

// ---------- Bandeau ----------
function showBanner(force = false) {
  if (!GA_ID || banner || (!force && read() !== null)) return;
  const btn = (label, yes) => h("button.btn.outline.grow", { onclick: () => Analytics.set(yes) }, label);
  banner = h("div.consent", { role: "region", "aria-label": "Mesure d'audience" },
    h("div.row", h("div.consent-title.grow", "Mesure d'audience"), infoButton("Mesure d'audience", details, { small: true })),
    h("p", "Plane GO aimerait compter ses visites avec Google Analytics (écrans vus, pays, type d'appareil) pour s'améliorer. Rien n'est envoyé sans ton accord."),
    h("div.row", btn("Refuser", false), btn("Accepter", true)));
  document.body.append(banner);
}

/** Détail derrière le bouton « i » du bandeau et du Profil. */
export function details() {
  return [
    "Si tu acceptes, Google Analytics (Google Ireland) reçoit les écrans que tu ouvres (sans code d'avion ni nom de joueur), le pays et la ville approximatifs, le type d'appareil, la langue, le site d'où tu viens et la durée de ta visite. Un cookie de Google garde un numéro au hasard pour reconnaître ton appareil, 13 mois au plus.",
    "Jamais envoyés : ton e-mail, ton pseudo, ta position, tes photos ni tes captures. Google peut traiter ces données aux États-Unis, dans le cadre du « Data Privacy Framework » reconnu par l'Union européenne.",
    "Si tu refuses, rien n'est envoyé et l'appli marche exactement pareil. Ton choix est gardé 6 mois sur cet appareil ; tu le changes quand tu veux dans ton Profil (« Mesure d'audience ») ou dans Confidentialité.",
    "Moins de 15 ans : n'accepte qu'avec l'accord d'un parent.",
  ];
}

if (GA_ID) {
  if (read() === "yes") start();
  else if (read() === "no") window["ga-disable-" + GA_ID] = true;
  else setTimeout(() => showBanner(), 2500); // après l'animation d'ouverture
}

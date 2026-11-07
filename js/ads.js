// Publicité Google AdSense dans le feed, voulue discrète :
// - seulement dans les listes du feed (Monde et Amis) : jamais dans le Quiz, le Scanner, la Collection, les fenêtres,
//   la page d'une publication ni les pages légales ;
// - une annonce après la 4e publication, puis une toutes les 8 ; pas de pub animée en plein écran, pas de bandeau collant
//   (les « annonces automatiques » doivent rester désactivées dans AdSense) ;
// - chaque annonce est étiquetée « Publicité » avec « Pourquoi cette pub ? » (loi LCEN art. 20, règlement DSA art. 26) ;
// - annonces NON personnalisées (requestNonPersonalizedAds) : rien n'est choisi d'après le profil du joueur
//   (protection des mineurs, DSA art. 28) ; Plane GO ne transmet aucune donnée du compte à Google ;
// - consentement : message certifié de Google (« Confidentialité et messages », IAB TCF v2.2), affiché par le script
//   d'AdSense, chargé seulement à l'ouverture du feed ; « Choix cookies et pub » (adChoices) permet de changer d'avis ;
// - rien n'est chargé tant que l'interrupteur ADS_ENABLED est à false, ni tant qu'ADSENSE (identifiants) et LEGAL
//   (adresse, téléphone) ne sont pas remplis dans config.js.
import { h, modal } from "./util.js";
import { ADS_ENABLED, ADSENSE, LEGAL, onGithubPages } from "./config.js";

export const AD_FIRST = 4; // première annonce après la 4e publication
export const AD_EVERY = 8; // puis une annonce toutes les 8 publications

/** Mentions légales complètes (obligatoires avant toute publicité) ? */
export const legalComplete = () => !!(LEGAL.editor && LEGAL.address && LEGAL.phone);
/** La publicité est-elle en service ? */
// Publicité seulement sur plane-go.com (le compte AdSense ne couvre pas la copie GitHub Pages)
export const adsOn = () => ADS_ENABLED && !!(ADSENSE.client && ADSENSE.slot && legalComplete()) && !onGithubPages();

let script = null;
/** Charge le script d'AdSense (une seule fois), qui affiche aussi le message de consentement de Google. */
export function loadAds() {
  if (!adsOn()) return Promise.resolve(false);
  if (script) return script;
  // Annonces non personnalisées : à déclarer avant toute demande d'annonce
  (window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 1;
  script = new Promise((resolve) => {
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE.client)}`;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false); // bloqueur de publicité, hors ligne : le feed continue sans pub
    document.head.append(s);
  });
  return script;
}

/**
 * Carte « Publicité » du feed. L'annonce n'est demandée que lorsque la carte approche de l'écran ;
 * si Google n'a pas d'annonce (ou si le script est bloqué), la carte disparaît.
 */
export function adCard() {
  const attrs = { style: { display: "block" }, "data-ad-client": ADSENSE.client, "data-ad-slot": ADSENSE.slot };
  if (ADSENSE.layoutKey) Object.assign(attrs, { "data-ad-format": "fluid", "data-ad-layout-key": ADSENSE.layoutKey });
  else Object.assign(attrs, { "data-ad-format": "auto", "data-full-width-responsive": "true" });
  const ins = h("ins.adsbygoogle", attrs);
  const card = h("div.card.ad-card", { role: "complementary", "aria-label": "Publicité" },
    h("div.ad-head", h("span.ad-label", "Publicité"), h("button.ad-why", { type: "button", onclick: whyThisAd }, "Pourquoi cette pub ?")),
    h("div.ad-body", ins));
  const gone = () => { io.disconnect(); mo.disconnect(); card.remove(); };
  const mo = new MutationObserver(() => { if (ins.getAttribute("data-ad-status") === "unfilled") gone(); });
  mo.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
  const io = new IntersectionObserver(async (es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    if (!(await loadAds())) { gone(); return; }
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { gone(); }
  }, { rootMargin: "600px 0px" });
  io.observe(card);
  return card;
}

/**
 * Insère les cartes « Publicité » dans une liste de publications qui s'allonge page après page.
 * counter : { posts, since } gardé par la liste ; renvoie les éléments à ajouter.
 */
export function withAds(nodes, counter) {
  if (!adsOn()) return nodes;
  const out = [];
  for (const n of nodes) {
    out.push(n);
    counter.posts++; counter.since++;
    const due = counter.shown ? counter.since >= AD_EVERY : counter.posts >= AD_FIRST;
    if (due) { out.push(adCard()); counter.since = 0; counter.shown = (counter.shown || 0) + 1; }
  }
  return out;
}

/** « Pourquoi cette pub ? » : qui la montre, sur quels critères, et comment changer ses choix (DSA art. 26). */
export function whyThisAd() {
  modal({ title: "Pourquoi cette pub ?", body: [
    "Cette annonce est fournie par Google (régie Google AdSense). Le nom de l'annonceur est indiqué par Google dans l'annonce elle-même (icône « i » en haut à droite de l'annonce).",
    "Elle n'est pas personnalisée : Google la choisit d'après le contenu de la page, la langue et la région approximative (déduite de ton adresse internet), et pas d'après ton profil, tes captures, ta position exacte ou ton historique. Plane GO ne transmet aucune donnée de ton compte à Google.",
    "Si tu as accepté les cookies, Google s'en sert seulement pour limiter la répétition d'une même annonce, mesurer son affichage et lutter contre la fraude. Si tu les as refusés, tu vois des annonces « limitées », sans cookie.",
    "La publicité aide à payer l'hébergement de Plane GO, qui reste gratuit.",
  ], buttons: [
    { label: "Choix cookies et pub", onClick: () => { adChoices(); } },
    { label: "OK", primary: true },
  ] });
}

/** Rouvre le message de consentement de Google pour changer d'avis (retrait du consentement aussi simple que l'accord). */
export async function adChoices() {
  if (!adsOn()) {
    modal({ title: "Choix cookies et pub", body: "Plane GO n'affiche pas de publicité pour le moment : aucun cookie publicitaire n'est utilisé, il n'y a rien à régler." });
    return;
  }
  await loadAds();
  const fc = (window.googlefc = window.googlefc || {});
  fc.callbackQueue = fc.callbackQueue || [];
  fc.callbackQueue.push(() => {
    try { window.googlefc.showRevocationMessage(); }
    catch { modal({ title: "Choix cookies et pub", body: "Le réglage des cookies de Google n'a pas pu s'ouvrir (bloqueur de publicité ?). Réessaie plus tard, ou efface les cookies de plane-go.com dans ton navigateur." }); }
  });
}

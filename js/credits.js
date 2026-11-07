// Crédits des photos (exigés par leurs licences) et des sources de données affichées dans l'appli.
// - Wikimedia Commons / Wikipédia : auteur + licence + lien vers la page du fichier. Les licences Creative Commons
//   l'exigent (sans ce crédit, la photo n'est plus utilisable). Lus dans les métadonnées du fichier (API imageinfo,
//   extmetadata, origin=*), gardés 30 jours (clé `photo_credits_v1`).
// - airport-data.com : photos des appareils fournies par adsbdb. Seulement les miniatures (le site réserve les
//   grandes photos à ses propres pages), avec le crédit.
// - Données des avions : adsb.fi (ses conditions demandent de le citer avec un lien vers son site), adsb.lol, adsbdb ;
//   recherche de lieux : OpenStreetMap (mention obligatoire).
import { h, ls } from "./util.js";

const KEY = "photo_credits_v1", KEEP = 30 * 864e5, MAX = 400;
const mem = new Map();

/** Fichier Wikimedia d'une adresse upload.wikimedia.org (miniature ou original) : { host, file } ou null. */
export function wikimediaFile(url) {
  const m = /^https?:\/\/upload\.wikimedia\.org\/(wikipedia|wikimedia)\/([a-z-]+)\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i.exec(url || "");
  if (!m) return null;
  let file = m[3];
  try { file = decodeURIComponent(file); } catch { /* nom déjà lisible */ }
  return { host: m[2] === "commons" ? "commons.wikimedia.org" : `${m[2]}.${m[1]}.org`, file: file.replace(/_/g, " ") };
}

/** Photo d'appareil d'airport-data.com (fournie par adsbdb) ? */
export const isAirportData = (url) => /^https?:\/\/([a-z0-9-]+\.)*airport-data\.com\//i.test(url || "");

// Texte sans balises (l'auteur est donné en HTML) : DOMParser ne charge rien et n'exécute rien
const plain = (html) => (html ? new DOMParser().parseFromString(String(html), "text/html").body.textContent.replace(/\s+/g, " ").trim() : "");
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const stored = () => { const o = ls.get(KEY, null); return o && typeof o === "object" ? o : {}; };

/** Crédit d'une photo : { author, license, licenseUrl, site, pageUrl }, ou null (photo du joueur…). */
export async function photoCredit(url) {
  if (!url) return null;
  if (isAirportData(url)) return { author: "", license: "", licenseUrl: "", site: "airport-data.com", pageUrl: "https://www.airport-data.com/" };
  const f = wikimediaFile(url);
  if (!f) return null;
  const k = f.host + "|" + f.file;
  if (mem.has(k)) return mem.get(k);
  const hit = stored()[k];
  if (hit && Date.now() - (hit.at || 0) < KEEP) { mem.set(k, hit.c); return hit.c; }
  const site = f.host.startsWith("commons.") ? "Wikimedia Commons" : "Wikipédia";
  const pageUrl = `https://${f.host}/wiki/File:${encodeURIComponent(f.file.replace(/ /g, "_"))}`;
  const p = (async () => {
    try {
      const api = `https://${f.host}/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=extmetadata`
        + `&iiextmetadatafilter=Artist|Credit|LicenseShortName|LicenseUrl&titles=${encodeURIComponent("File:" + f.file)}`;
      const r = await fetch(api);
      const j = r.ok ? await r.json() : null;
      const page = j && Object.values(j.query?.pages || {})[0];
      const md = page?.imageinfo?.[0]?.extmetadata;
      if (!md) throw new Error("métadonnées absentes");
      const c = { author: cut(plain(md.Artist?.value) || plain(md.Credit?.value), 70), license: cut(plain(md.LicenseShortName?.value), 40),
        licenseUrl: md.LicenseUrl?.value || "", site, pageUrl };
      const s = stored(), keys = Object.keys(s);
      if (keys.length >= MAX) keys.slice(0, keys.length - MAX + 1).forEach((x) => delete s[x]);
      s[k] = { at: Date.now(), c }; ls.set(KEY, s);
      mem.set(k, c);
      return c;
    } catch {
      return { author: "", license: "", licenseUrl: "", site, pageUrl }; // hors ligne : au moins la source et son lien
    }
  })();
  mem.set(k, p);
  return p;
}

/**
 * Licence sans risque : domaine public, CC0 ou Creative Commons 4.0. Les 4.0 laissent 30 jours pour corriger un crédit
 * oublié (droits rétablis d'eux-mêmes) ; les plus anciennes (2.0, 3.0) non. Celles-ci restent utilisables avec le
 * crédit complet, mais on choisit d'abord les autres (net.js).
 */
export function safeLicense(license) {
  return /public domain|domaine public|^pd\b|cc0|cc[ -]?by(-sa)?[ -]4\.0/i.test(String(license || "").trim());
}

/** Crédit déjà connu (lu avec la recherche Commons) : évite une requête de plus quand la photo s'affiche. */
export function rememberCredit(url, c) {
  const f = wikimediaFile(url);
  if (!f || !c) return;
  const k = f.host + "|" + f.file;
  mem.set(k, c);
  const s = stored(), keys = Object.keys(s);
  if (keys.length >= MAX) keys.slice(0, keys.length - MAX + 1).forEach((x) => delete s[x]);
  s[k] = { at: Date.now(), c }; ls.set(KEY, s);
}

const link = (href, text, open = true) => (href && open ? h("a", { href, target: "_blank", rel: "noopener" }, text) : h("span", text));

/**
 * Petite ligne « Photo : Auteur · Licence · Wikimedia Commons » (liens vers la licence et la page du fichier), remplie
 * quand le crédit est connu ; cachée pour une photo qui n'en a pas besoin (photo du joueur…). `el.set(url)` change de photo.
 * { hold: true } (quiz) : auteur et licence affichés tout de suite (crédit complet), mais le lien vers la page du fichier
 * (dont le titre donne la réponse) seulement après la réponse, avec `el.reveal()`. Les photos du quiz dont l'auteur
 * donnerait la réponse (constructeur…) sont écartées avant (`quizPhotos` de net.js).
 */
export function creditLine(url = null, { hold = false } = {}) {
  const el = h("div.photo-credit");
  let cur = null, open = !hold, token = 0;
  const draw = () => {
    el.hidden = !cur;
    if (!cur) { el.replaceChildren(); return; }
    const parts = [h("span", "Photo :"), " "];
    if (cur.author) parts.push(h("span", { "data-notr": "" }, cur.author), " · ");
    if (cur.license) parts.push(h("span", { "data-notr": "" }, link(cur.licenseUrl, cur.license)), " · ");
    parts.push(link(cur.pageUrl, cur.site, open));
    el.replaceChildren(...parts);
  };
  el.set = (u) => {
    const my = ++token;
    cur = null; draw();
    if (u) photoCredit(u).then((c) => { if (my === token) { cur = c; draw(); } }).catch(() => {});
  };
  el.reveal = () => { open = true; draw(); };
  el.set(url);
  return el;
}

/** Ligne « Données des avions : adsb.fi · adsb.lol · adsbdb » avec les liens (adsb.fi demande d'être cité avec un lien). */
export function dataSources() {
  return h("div.photo-credit", h("span", "Données des avions :"), " ", link("https://adsb.fi/", "adsb.fi"), " · ",
    link("https://adsb.lol/", "adsb.lol"), " · ", link("https://adsbdb.com/", "adsbdb"));
}

/** Mention obligatoire sous les résultats de la recherche de lieux (OpenStreetMap / Nominatim). */
export function osmCredit() {
  return h("div.photo-credit", h("span", "Recherche de lieux :"), " ",
    link("https://www.openstreetmap.org/copyright", "© les contributeurs d'OpenStreetMap"));
}

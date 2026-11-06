// Données en ligne : avions ADS-B (via le relais Supabase), adsbdb, Wikipédia.
import { LANG } from "./i18n.js";
import { Supa } from "./supa.js";
import { distanceKm, bearingDeg, ls, sleep } from "./util.js";
import { looksMilitary, modelQueries } from "./game.js";

// ---------- ADS-B ----------
/**
 * Confidentialité : la position envoyée aux services ADS-B est arrondie au centième de degré (≈ 1 km) et le rayon
 * élargi d'1 km pour compenser. Les distances et directions sont ensuite calculées sur le téléphone, avec la
 * position exacte, qui ne quitte jamais l'appareil.
 */
const ROUND_KM = 1;
const coarse = (x) => (Math.round(x * 100) / 100).toFixed(2);

export const Adsb = {
  lastSource: "",
  async around(lat, lon, radiusKm) {
    const nm = Math.min(250, Math.max(1, Math.ceil((radiusKm + ROUND_KM) / 1.852)));
    const res = await Supa.fn("adsb", `lat=${coarse(lat)}&lon=${coarse(lon)}&dist=${nm}`);
    Adsb.lastSource = res.source || "";
    return parse(res.ac, lat, lon).filter((a) => a.distanceKm != null && a.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  },
  /** Dernière position d'un avion précis : cherché autour de sa dernière position, distance et direction calculées depuis moi. */
  async track(ac, me) {
    if (ac.lat == null || ac.lon == null) return null;
    const res = await Supa.fn("adsb", `lat=${ac.lat.toFixed(5)}&lon=${ac.lon.toFixed(5)}&dist=25`);
    return parse(res.ac, me.lat, me.lon).find((a) => a.hex === ac.hex) || null;
  },
  async nearestMilitary(lat, lon) {
    const res = await Supa.fn("adsb", "mil=1");
    Adsb.lastSource = res.source || "";
    return parse(res.ac, lat, lon).filter((a) => a.distanceKm != null && !a.onGround)
      .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
  },
};

function parse(arr, myLat, myLon) {
  const s = (v) => (v == null ? "" : String(v).trim());
  const out = [];
  for (const o of arr || []) {
    const hex = s(o.hex);
    if (!hex) continue;
    const lat = typeof o.lat === "number" ? o.lat : null, lon = typeof o.lon === "number" ? o.lon : null;
    const flags = o.dbFlags | 0, callsign = s(o.flight);
    out.push({
      hex, callsign, registration: s(o.r), type: s(o.t), description: s(o.desc), operator: s(o.ownOp),
      lat, lon, altitudeFt: typeof o.alt_baro === "number" ? o.alt_baro : null, onGround: o.alt_baro === "ground",
      speedKt: typeof o.gs === "number" ? o.gs : null, trackDeg: typeof o.track === "number" ? o.track : null,
      // Vitesse verticale (pieds/min, négative = descend) : sert à repérer les avions qui vont atterrir
      vertRateFpm: typeof o.baro_rate === "number" ? o.baro_rate : typeof o.geom_rate === "number" ? o.geom_rate : null,
      military: (flags & 1) !== 0 || looksMilitary(callsign),
      distanceKm: lat != null && lon != null ? distanceKm(myLat, myLon, lat, lon) : null,
      bearingDeg: lat != null && lon != null ? bearingDeg(myLat, myLon, lat, lon) : null,
      category: s(o.category), interesting: (flags & 2) !== 0, fetchedAt: Date.now(),
    });
  }
  return out;
}

// ---------- adsbdb : propriétaire, pays, photo, trajet ----------
const BASE = "https://api.adsbdb.com/v0";
const infoCache = new Map(), routeCache = new Map();

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

export const AdsbDb = {
  async aircraft(hex) {
    const key = hex.toLowerCase().replace(/^~/, "");
    if (infoCache.has(key)) return infoCache.get(key);
    const j = await getJson(`${BASE}/aircraft/${key}`);
    const a = j?.response?.aircraft;
    const info = a && typeof a === "object" ? {
      manufacturer: a.manufacturer || "", model: a.type || "", owner: a.registered_owner || "",
      countryName: a.registered_owner_country_name || "", countryIso: a.registered_owner_country_iso_name || "",
      photoUrl: a.url_photo || null,
    } : null;
    infoCache.set(key, info);
    return info;
  },
  async route(callsign) {
    const cs = (callsign || "").trim().toUpperCase();
    if (cs.length < 3) return null;
    if (routeCache.has(cs)) return routeCache.get(cs);
    const j = await getJson(`${BASE}/callsign/${cs}`);
    const fr = j?.response?.flightroute;
    const ap = (o) => ({
      name: o.name || "", city: o.municipality || "", countryName: o.country_name || "", countryIso: o.country_iso_name || "",
      iata: o.iata_code || "", icao: o.icao_code || "", lat: o.latitude ?? null, lon: o.longitude ?? null,
    });
    const route = fr?.origin && fr?.destination ? { origin: ap(fr.origin), destination: ap(fr.destination), airline: fr.airline?.name || "" } : null;
    routeCache.set(cs, route);
    return route;
  },
  /** Infos + trajet, sans jamais lever d'erreur. */
  async extra(ac) {
    const [info, route] = await Promise.all([
      AdsbDb.aircraft(ac.hex).catch(() => null),
      ac.callsign ? AdsbDb.route(ac.callsign).catch(() => null) : null,
    ]);
    return { info, route };
  },
};

// ---------- Wikipédia ----------
const AVIATION = ["avion", "aéronef", "hélicoptère", "appareil", "chasseur", "bombardier", "ravitailleur", "aircraft", "airliner",
  "airplane", "aeroplane", "helicopter", "jet", "fighter", "transport", "tanker", "bomber", "trainer", "drone", "airlifter",
  "turboprop", "biréacteur", "quadriréacteur", "monomoteur", "bimoteur", "planeur", "glider"];
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const enc = encodeURIComponent;

class NotFound extends Error {}
async function wget(url) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (r.status === 404) throw new NotFound();
    if ((r.status === 429 || r.status === 503) && attempt < 2) { await sleep(2000 * (attempt + 1)); continue; }
    throw new Error("HTTP " + r.status);
  }
}
async function search(lang, q, limit) {
  const j = await wget(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srprop=&srlimit=${limit}&srsearch=${enc(q)}`);
  return (j.query?.search || []).map((x) => x.title).filter(Boolean);
}
async function summary(lang, title) {
  const o = await wget(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${enc(title.replace(/ /g, "_"))}`);
  if (o.type === "disambiguation" || !o.extract) return null;
  const thumb = (o.thumbnail || o.originalimage)?.source || null;
  const big = thumb && thumb.includes("/thumb/") ? thumb.replace(/\/\d+px-/, "/1024px-") : thumb;
  return {
    s: { title: o.title || title, extract: o.extract, pageUrl: o.content_urls?.mobile?.page || `https://${lang}.wikipedia.org/wiki/${enc(title.replace(/ /g, "_"))}`,
      thumbnailUrl: thumb, imageUrl: big, lang, searchOnly: false },
    desc: o.description || "",
  };
}
const isAviation = (r) => AVIATION.some((w) => (r.desc + " " + r.s.extract.slice(0, 300)).toLowerCase().includes(w));
function isRelevant(title, query) {
  const t = norm(title);
  const tokens = query.split(/[ \-/]/).map(norm).filter((x) => x.length >= 2);
  const withDigits = tokens.filter((x) => /\d/.test(x));
  const keys = withDigits.length ? withDigits : tokens.filter((x) => x.length >= 4 && x !== "aircraft");
  return keys.length > 0 && keys.some((k) => t.includes(k));
}
// Wikipédia dans la langue du joueur d'abord, l'autre ensuite
const WIKI_ORDER = LANG === "en" ? ["en", "fr"] : ["fr", "en"];
const safe = async (p) => { try { return await p; } catch { return null; } };

async function findExact(queries) {
  for (const q of queries.slice(0, 3)) {
    if (q.endsWith(" aircraft")) continue;
    for (const lang of WIKI_ORDER) {
      const r = await safe(summary(lang, q));
      if (r && isRelevant(r.s.title, q) && isAviation(r)) return r.s;
    }
  }
  return null;
}
async function findModel(queries) {
  for (const lang of WIKI_ORDER) {
    for (const q of queries) {
      const titles = await safe(search(lang, q, 3));
      if (!titles) continue;
      const codeOnly = q.endsWith(" aircraft"); // « AS55 aircraft » : dernier recours, le code doit être dans le titre
      for (const [i, title] of titles.entries()) {
        const matches = isRelevant(title, q);
        if (!matches && (i > 0 || codeOnly)) continue;
        const r = await safe(summary(lang, title));
        // Toujours un article d'aviation : « Aerospatiale Fennec » ne doit pas donner le fennec (le renard)
        if (r && isAviation(r)) return r.s;
      }
    }
  }
  return null;
}
async function langLink(lang, title, target) {
  const j = await wget(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=langlinks&lllang=${target}&titles=${enc(title)}`);
  for (const p of Object.values(j.query?.pages || {})) if (p.langlinks?.length) return p.langlinks[0]["*"];
  return null;
}
export async function commonsPhoto(query) {
  const q = (query || "").trim();
  if (!q) return null;
  const j = await wget(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=${enc(q + " filetype:bitmap")}&prop=imageinfo&iiprop=url|mime&iiurlwidth=400`);
  const pages = Object.values(j.query?.pages || {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (info?.mime !== "image/jpeg" || !info.thumburl) continue;
    return [info.thumburl, info.thumburl.replace(/\/\d+px-/, "/1024px-")];
  }
  return null;
}
/**
 * Plusieurs photos d'un modèle sur Wikimedia Commons (JPEG, 800 px), pour remplacer une photo du quiz signalée
 * ou introuvable. On écarte les vues de détail (cockpit, cabine, moteur…), les maquettes et les schémas.
 */
const NOT_A_PLANE = /cockpit|cabin|cabine|interior|int[ée]rieur|seat|si[èe]ge|engine|moteur|logo|maquette|model|diagram|drawing|sch[ée]ma|map|carte|galley|lavatory|wheel|landing.gear|tail|d[ée]rive|wing|aile/i;
export async function commonsPhotos(query, limit = 15) {
  const q = (query || "").trim();
  if (!q) return [];
  const j = await wget(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=${limit}&gsrsearch=${enc(q + " filetype:bitmap")}&prop=imageinfo&iiprop=url|mime&iiurlwidth=800`);
  return Object.values(j.query?.pages || {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    .filter((p) => p.imageinfo?.[0]?.mime === "image/jpeg" && p.imageinfo[0].thumburl && !NOT_A_PLANE.test(p.title || ""))
    .map((p) => p.imageinfo[0].thumburl);
}
const altMem = new Map();

async function withPhoto(s) {
  if (s.thumbnailUrl) return s;
  if (s.lang !== "en") {
    const t = await safe(langLink(s.lang, s.title, "en"));
    const en = t && (await safe(summary("en", t)));
    if (en?.s.thumbnailUrl) return { ...s, thumbnailUrl: en.s.thumbnailUrl, imageUrl: en.s.imageUrl };
  }
  const p = await safe(commonsPhoto(s.title));
  return p ? { ...s, thumbnailUrl: p[0], imageUrl: p[1] } : s;
}

const WIKI_KEY = "wiki_cache_v3" + (LANG === "en" ? "_en" : ""), RETRY_MS = 7 * 86400e3;
const wikiMem = new Map(), inflight = new Map();
let running = 0; const queue = [];
const gate = () => new Promise((res) => { if (running < 3) { running++; res(); } else queue.push(res); });
const release = () => { const n = queue.shift(); if (n) n(); else running--; };

export const Wiki = {
  /** Autres photos du modèle (Wikimedia Commons), gardées le temps de la séance. */
  async altPhotos(name) {
    const q = (name || "").replace(/\s*\(.*?\)/g, "").trim();
    if (!q) return [];
    if (!altMem.has(q)) altMem.set(q, commonsPhotos(q).catch(() => []));
    return altMem.get(q);
  },
  /** Article du modèle (photo + résumé), ou fiche de secours ; null si rien. Mis en cache. */
  async find({ type = "", model = "", military = false, title = "" }) {
    const key = `${type.trim().toUpperCase()}|${model.trim().toLowerCase()}|${military}`;
    if (wikiMem.has(key)) return wikiMem.get(key);
    const cache = ls.get(WIKI_KEY, {});
    const c = cache[key];
    if (c && !(c.none && Date.now() - c.at > RETRY_MS)) { const v = c.none ? null : c; wikiMem.set(key, v); return v; }
    const unknown = !type.trim() || type.trim().toUpperCase() === "ZZZZ";
    if (unknown && !model.trim()) return null;
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      await gate();
      try {
        const queries = modelQueries(type, model, military, null);
        let s = (await findExact(queries)) || (await findModel(queries));
        if (s) s = await withPhoto(s);
        if (!s) {
          const name = title || model || type;
          const photo = await safe(commonsPhoto(name));
          s = { title: name, extract: "Wikipédia n'a pas d'article consacré à ce modèle. Touchez « Chercher sur Wikipédia » pour lancer une recherche." + (photo ? "\n\nPhoto : Wikimedia Commons." : ""),
            pageUrl: `https://${WIKI_ORDER[0]}.wikipedia.org/w/index.php?search=${enc(name)}`, thumbnailUrl: photo?.[0] || null, imageUrl: photo?.[1] || null, searchOnly: true };
        }
        const complete = !s.searchOnly || s.thumbnailUrl;
        wikiMem.set(key, s);
        if (complete) { const all = ls.get(WIKI_KEY, {}); all[key] = s; ls.set(WIKI_KEY, all); }
        return s;
      } catch {
        return null;
      } finally { release(); inflight.delete(key); }
    })();
    inflight.set(key, p);
    return p;
  },
};

// ---------- Recherche d'un lieu (position indiquée à la main quand le GPS ne marche pas) ----------
// OpenStreetMap (Nominatim, accepte les appels directs) : reçoit seulement le texte tapé par le joueur.
export const Places = {
  /** Lieux correspondant à « Lyon », « 92350 »… : [{ lat, lon, place, detail }] (5 au plus). */
  async search(q) {
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6"
      + `&accept-language=${LANG}&q=${encodeURIComponent(q)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const seen = new Set();
    return (await r.json()).map((x) => {
      const a = x.address || {};
      const name = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || x.name || String(x.display_name).split(",")[0];
      const detail = [a.postcode, a.county || a.state_district, a.state, a.country].filter((v, i, l) => v && v !== name && l.indexOf(v) === i).join(", ");
      return { lat: parseFloat(x.lat), lon: parseFloat(x.lon), place: name, detail };
    }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && !seen.has(p.place + p.detail) && seen.add(p.place + p.detail)).slice(0, 5);
  },
};

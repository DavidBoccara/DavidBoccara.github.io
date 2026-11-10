// Données en ligne : avions ADS-B (relais Supabase, ou le téléphone dans l'appli Android 1.27+), adsbdb, Wikipédia.
import { photoCredit, safeLicense, rememberCredit, wikimediaFile } from "./credits.js";
import { LANG } from "./i18n.js";
import { Supa } from "./supa.js";
import { hit as countCall } from "./usage.js";
import { distanceKm, bearingDeg, ls, sleep } from "./util.js";
import { looksMilitary, modelQueries } from "./game.js";
import { AcFlags } from "./acflags.js";

// ---------- ADS-B ----------
/**
 * Confidentialité : la position envoyée aux services ADS-B est arrondie au centième de degré (≈ 1 km) et le rayon
 * élargi d'1 km pour compenser. Les distances et directions sont ensuite calculées sur le téléphone, avec la
 * position exacte, qui ne quitte jamais l'appareil.
 */
const ROUND_KM = 1;
const coarse = (x) => (Math.round(x * 100) / 100).toFixed(2);

/**
 * Appli Android 1.27+ : la demande est faite par le téléphone lui-même (avec son adresse internet, comme le radar
 * écran éteint) au lieu du relais Supabase, partagé par tous les joueurs et limité par adsb.fi à 1 demande par seconde.
 * Même requête, même réponse ({source, ac}) ; relais en secours si le téléphone n'y arrive pas. Dans un navigateur :
 * toujours le relais (adsb.fi et adsb.lol refusent les demandes faites par une page web).
 */
const phone = () => (typeof window !== "undefined" && typeof window.PlaneGONative?.adsbFetch === "function" ? window.PlaneGONative : null);
const phoneWaiting = new Map();
let seq = 0;
if (typeof window !== "undefined") window.addEventListener("planego-adsb", (e) => {
  const done = phoneWaiting.get(e.detail);
  if (!done) return;
  phoneWaiting.delete(e.detail);
  let o = null;
  try { o = JSON.parse(phone()?.adsbTake(e.detail) || "null"); } catch { /* réponse illisible */ }
  done(o);
});
function phoneFetch(query) {
  const id = `a${++seq}_${Date.now().toString(36)}`;
  return new Promise((resolve) => {
    const t = setTimeout(() => { phoneWaiting.delete(id); resolve(null); }, 35000);
    phoneWaiting.set(id, (o) => { clearTimeout(t); resolve(o); });
    try { phone().adsbFetch(id, query); countCall("telephone"); } catch { clearTimeout(t); phoneWaiting.delete(id); resolve(null); }
  });
}
async function adsbQuery(query) {
  if (phone()) {
    const o = await phoneFetch(query);
    if (Array.isArray(o?.ac)) { Adsb.via = "phone"; return o; }
  }
  Adsb.via = "relay";
  return Supa.fn("adsb", query);
}

export const Adsb = {
  lastSource: "",
  /** "phone" (appli 1.27+) ou "relay" : par où est passée la dernière demande. */
  via: "",
  async around(lat, lon, radiusKm) {
    const nm = Math.min(250, Math.max(1, Math.ceil((radiusKm + ROUND_KM) / 1.852)));
    const res = await adsbQuery(`lat=${coarse(lat)}&lon=${coarse(lon)}&dist=${nm}`);
    Adsb.lastSource = res.source || "";
    return parse(res.ac, lat, lon).filter((a) => a.distanceKm != null && a.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  },
  /** Dernière position d'un avion précis : cherché autour de sa dernière position, distance et direction calculées depuis moi. */
  async track(ac, me) {
    if (ac.lat == null || ac.lon == null) return null;
    const res = await adsbQuery(`lat=${ac.lat.toFixed(5)}&lon=${ac.lon.toFixed(5)}&dist=25`);
    return parse(res.ac, me.lat, me.lon).find((a) => a.hex === ac.hex) || null;
  },
  async nearestMilitary(lat, lon) {
    const res = await adsbQuery("mil=1");
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
      // Photo airport-data.com (photographes, pas de licence libre) : jamais affichée ; sert seulement à vérifier que la
      // photo d'un joueur n'est pas une copie de celle-ci (verify.js). À l'écran : photos Wikimedia (aircraftPhotos).
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
  "turboprop", "biréacteur", "quadriréacteur", "monomoteur", "bimoteur", "planeur", "glider",
  // espagnol (Wikipédia en espagnol pour les joueurs hispanophones)
  "avión", "aeronave", "helicóptero", "caza", "bombardero", "planeador", "birreactor", "cuatrimotor", "monomotor", "bimotor",
  "turbohélice", "avioneta", "dron", "cisterna"];
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
  const big = wmSize(thumb, 960);
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
const WIKI_ORDER = { en: ["en", "fr"], es: ["es", "en", "fr"] }[LANG] || ["fr", "en"];
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
/**
 * Photos JPEG d'une recherche sur Wikimedia Commons, avec leur licence : [{ thumb, license, title }] dans l'ordre de
 * la recherche. Vues de détail (cockpit, cabine, moteur…), maquettes et schémas écartées.
 */
// Photos sans avion entier (d'après le nom du fichier) : intérieur, pièce, dessin… et, depuis le 8/11/2026, les photos de
// personnes et d'événements (une conférence de presse Gulfstream illustrait une question du quiz).
// Mots entiers seulement (\b) : « wing » trouvé dans « Eurowings » écartait toutes les photos Eurowings (vol Eurowings
// illustré par un A320neo de Frontier le 8/11/2026), « seat » celles prises à Seattle, « tail » celles de Tailwind…
const NOT_A_PLANE = /cockpit|\bcabins?\b|\bcabines?\b|interior|int[ée]rieur|\bseats?\b|\bsi[èe]ges?\b|\bengines?\b|\bmoteurs?\b|\blogos?\b|maquette|\bmodels?\b|diagram|drawing|sch[ée]ma|\bmaps?\b|\bcartes?\b|galley|lavatory|\bwheels?\b|landing.gear|\btails?\b|\bd[ée]rives?\b|\bwing(s|tips?|lets?)?\b|\bailes?\b|\bpress\b|konferenz|conference|conf[ée]rence|speech|speaker|podium|portrait|\bceo\b|\bpresident\b|\bpr[ée]sident\b|interview|ceremony|c[ée]r[ée]monie|employee|headquarter|building|b[âa]timent|\boffice\b|factory|usine|assembly line|cha[iî]ne d.assemblage/i;
async function commonsSearch(query, limit, width) {
  const q = (query || "").trim();
  if (!q) return [];
  const j = await wget(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=${limit}&gsrsearch=${enc(q + " filetype:bitmap")}`
    + `&prop=imageinfo&iiprop=url|mime|extmetadata&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist&iiurlwidth=${width}`);
  return Object.values(j.query?.pages || {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    .filter((p) => p.imageinfo?.[0]?.mime === "image/jpeg" && p.imageinfo[0].thumburl && !NOT_A_PLANE.test(p.title || ""))
    .map((p) => {
      const md = p.imageinfo[0].extmetadata || {};
      return { thumb: p.imageinfo[0].thumburl, title: p.title, license: md.LicenseShortName?.value || "",
        licenseUrl: md.LicenseUrl?.value || "", author: plainText(md.Artist?.value) };
    });
}
/**
 * Miniature Wikimedia à une largeur standard (250, 330, 500, 960, 1280 px…) : Wikimedia refuse désormais les autres
 * largeurs (1024 px…) quand la miniature n'existe pas déjà, et l'image ne se chargeait pas (le quiz tournait dans le vide).
 */
export const wmSize = (url, w) => (url && /\/thumb\//.test(url) ? url.replace(/\/\d+px-/, `/${w}px-`) : url);
const plainText = (html) => (html ? new DOMParser().parseFromString(String(html), "text/html").body.textContent.replace(/\s+/g, " ").trim() : "");
const flat = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
/** Mots séparés par une espace, sans accents ni ponctuation (« File:Air_France A320.jpg » → « file air france a320 jpg »). */
const words = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Désignation du modèle telle qu'on la trouve dans les noms de fichiers : « A-220-300 » → « a220 », « 737-800 » → « 737 »,
 * « EC-135 » → « ec135 », « PC-12 » → « pc12 » ; null si le nom n'a pas de chiffre (« Rafale »).
 */
function modelCore(name) {
  for (const w of String(name || "").toLowerCase().split(/\s+/)) {
    const m = /^([a-z]*)-?(\d+)/.exec(w);
    if (m) return m[1] + m[2];
  }
  return null;
}
/**
 * Le nom du fichier d'une photo Wikimedia correspond-il bien à l'avion (désignation du modèle, ex. « g100 » ; pas une
 * photo de personnes ni une version trompeuse) ? Pour la photo de l'article Wikipédia, dernier recours du quiz : un
 * article d'entreprise (« Gulfstream Aerospace ») peut avoir pour photo une conférence de presse.
 */
export function photoMatchesModel(url, article, ...names) {
  const file = wikimediaFile(url)?.file || "";
  if (!file || NOT_A_PLANE.test(file)) return false;
  const core = names.map(modelCore).find(Boolean);
  const variant = (names.join(" ").match(VARIANTS) || [])[0];
  // Article du modèle lui-même (« Gulfstream G100 ») : sa photo peut ne porter que l'immatriculation (« N916CG.jpg »)
  const ofModel = !core || flat(article).includes(core) || flat(file).includes(core);
  return ofModel && (variant ? flat(file).includes(flat(variant)) : !VARIANTS.test(file));
}
// Constructeurs : un auteur qui s'appelle ainsi (photo officielle) donnerait la réponse du quiz
const MAKERS = /airbus|boeing|embraer|bombardier|\batr\b|dassault|cessna|pilatus|beech|gulfstream|lockheed|havilland|saab|fokker|sukhoi|antonov|ilyushin|tupolev|comac|mitsubishi|piper|diamond|cirrus|eurocopter|leonardo|agusta|sikorsky|\bbell\b|robinson|daher|socata|textron|learjet|hawker|mcdonnell|douglas|northrop|grumman|nhindustries|\brobin\b|tecnam|casa\b|kawasaki/i;
/** L'auteur d'une photo donnerait-il la réponse (constructeur, nom ou désignation du modèle) ? */
export function revealsAnswer(author, name) {
  if (!author || MAKERS.test(author)) return true;
  const a = flat(author), core = modelCore(name);
  if (core && a.includes(core)) return true;
  return String(name || "").toLowerCase().split(/[\s/()-]+/).filter((w) => w.length >= 4 && !/^\d+$/.test(w)).some((w) => a.includes(flat(w)));
}
const GENERIC = new Set(["air", "airlines", "airline", "airways", "aviation", "lines", "corporation", "company", "group", "limited", "ltd",
  "inc", "the", "sa", "ag", "spa", "plc", "de", "of", "and", "international", "cargo", "express", "regional", "leasing", "capital"]);
const airlineWord = (s) => (String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w)).sort((a, b) => b.length - a.length)[0] || "");

// Nom de la compagnie sans forme juridique (« Air Baltic Corporation » → « Air Baltic »)
const airlineName = (s) => String(s || "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
  .filter((w) => w && !/^(corporation|company|group|limited|ltd|inc|sa|ag|spa|plc|gmbh|as|asa|ab|nv|bv|srl|llc)$/i.test(w)).join(" ");

// Recherches Commons gardées pour la session (le quiz, les fiches et les vignettes d'un même avion font les mêmes) ; un
// échec (hors ligne…) n'est pas gardé, pour pouvoir réessayer. Deux recherches à la fois au plus (les vignettes du
// Scanner en lancent des dizaines) ; celles des fiches et du quiz passent avant celles des vignettes (low), et une
// recherche de vignette encore en attente passe devant si une fiche la demande.
const searchMem = new Map(), waiting = new Map(), lanes = { high: [], low: [] };
let searching = 0;
function pump() {
  while (searching < 2) {
    const task = lanes.high.shift() || lanes.low.shift();
    if (!task) return;
    waiting.delete(task.q); searching++;
    safe(commonsSearch(task.q, 20, 960)).then((r) => { searching--; if (!r) searchMem.delete(task.q); task.done(r); pump(); });
  }
}
function searchOnce(q, low = false) {
  const w = waiting.get(q);
  if (w && !low && lanes.low.includes(w)) { lanes.low.splice(lanes.low.indexOf(w), 1); lanes.high.push(w); }
  if (!searchMem.has(q)) searchMem.set(q, new Promise((done) => {
    const task = { q, done };
    waiting.set(q, task); (low ? lanes.low : lanes.high).push(task); pump();
  }));
  return searchMem.get(q);
}
const shuffled = (list) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const pageOf = (title) => `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_")).replace("%3A", ":")}`;
/** Garde le crédit lu avec la recherche (credits.js) et renvoie l'adresse de la photo (960 px, taille standard). */
const credited = (x) => {
  rememberCredit(x.thumb, { author: x.author.length > 70 ? x.author.slice(0, 69).trimEnd() + "…" : x.author, license: x.license,
    licenseUrl: x.licenseUrl, site: "Wikimedia Commons", pageUrl: pageOf(x.title) });
  return x.thumb;
};
/**
 * Licences acceptées pour les photos des fiches : celles sans risque (credits.js), puis Creative Commons BY / BY-SA 2.0,
 * 2.5 et 3.0, affichées avec leur crédit complet (titre, auteur, licence, lien). Pas la GFDL (texte de la licence à
 * joindre). Le quiz garde seulement les licences sans risque.
 */
const usableLicense = (l) => safeLicense(l) || /^cc[ -]?by(-sa)?[ -](2\.0|2\.5|3\.0)\b/i.test(String(l || "").trim());
/**
 * Recherches Commons d'un avion : cet appareil (immatriculation et désignation du modèle dans le nom du fichier), le même
 * modèle aux couleurs de sa compagnie (« TAP Portugal a320 » ; aussi le nom collé, « airBaltic », s'il y a peu de photos
 * sans risque), et (withModel) le modèle. Photos avec un auteur connu et une licence acceptée ; `safe` = sans risque.
 * `failed` : une recherche n'a pas abouti (résultat à ne pas garder).
 */
// Versions d'un modèle qui ne lui ressemblent pas : un BelugaXL est un « A330-743L », un ravitailleur un « A330 MRTT »,
// le Dreamlifter un « 747-400 LCF »… Leurs photos sont écartées (quiz et fiches), sauf si l'avion cherché est lui-même
// cette version. Pas pour les photos de l'appareil précis (immatriculation) : c'est bien lui.
const VARIANTS = /beluga|mrtt|voyager|ph[eé]nix|\bkc[- ]?(10|30|46|135|767)\b|dreamlifter|\blcf\b|guppy|shuttle|tanker|ravitailleur/i;

async function commonsSets({ registration = "", airline = "", model = "", name = "", article = "" }, withModel, low = false) {
  const core = modelCore(model) || modelCore(name) || modelCore(article);
  // L'avion cherché est une de ces versions (« beluga »…) : seulement ses photos à elle ; sinon, aucune de ces versions
  const variant = (`${model} ${name} ${article}`.match(VARIANTS) || [])[0];
  const hasCore = (x) => (!core || flat(x.title).includes(core)) && (variant ? flat(x.title).includes(flat(variant)) : !VARIANTS.test(x.title));
  const reg = flat(registration), word = airlineWord(airline), company = airlineName(airline);
  const mark = (list, keep) => (list || []).filter((x) => x.author && usableLicense(x.license) && keep(x))
    .map((x) => ({ ...x, safe: safeLicense(x.license) }));
  const inAirline = (x) => flat(x.title).includes(word) && hasCore(x);
  const [byReg, byAirline, byModel] = await Promise.all([
    reg.length >= 4 ? searchOnce(`"${registration}"`, low) : [],
    word && core ? searchOnce(`${company} ${core}`, low) : [],
    withModel ? searchOnce(article || model || name, low) : [],
  ]);
  let airlineSet = mark(byAirline, inAirline), byCompact = [];
  const compact = company.replace(/\s+/g, "");
  if (word && core && compact !== company && airlineSet.filter((x) => x.safe).length < 3) {
    byCompact = await searchOnce(`${compact} ${core}`, low);
    airlineSet = [...airlineSet, ...mark(byCompact, inAirline).filter((x) => !airlineSet.some((y) => y.title === x.title))];
  }
  return {
    reg: mark(byReg, (x) => flat(x.title).includes(reg) && (!core || flat(x.title).includes(core))),
    airline: airlineSet,
    model: mark(byModel, hasCore),
    company,
    failed: [byReg, byAirline, byModel, byCompact].includes(null),
  };
}

const quizMem = new Map();
/**
 * Photos libres de l'avion du quiz sur Wikimedia Commons, de la plus précise à la plus générale :
 * 1) cet avion précis (immatriculation et désignation du modèle dans le nom du fichier), 2) le même modèle aux couleurs
 * de la même compagnie, 3) le modèle. Seulement des licences sans risque (domaine public, CC0, Creative Commons 4.0),
 * avec un auteur connu qui ne donne pas la réponse ; tirées au hasard dans chaque groupe pour varier les photos.
 * Le crédit lu ici est gardé (credits.js) : il s'affiche sous la photo sans nouvelle requête.
 * ctx = { registration, airline, model (désignation ADS-B, ex. « Airbus A220-300 »), name (réponse du quiz), article,
 * livery (question sur la compagnie : ses noms ; seulement les photos 1 et 2 dont le nom de fichier porte l'un d'eux,
 * c.-à-d. aux couleurs de la compagnie, d'un auteur qui ne la nomme pas) }.
 */
export async function quizPhotos(ctx) {
  const { registration = "", airline = "", model = "", name = "", article = "", livery = null } = ctx;
  const key = [registration, airline, model, name, article, livery ? "livery" : ""].join("|");
  if (!quizMem.has(key)) quizMem.set(key, (async () => {
    const sets = await commonsSets(ctx, !livery);
    if (sets.failed) quizMem.delete(key); // recherche ratée (réseau, Commons occupé) : pas gardée, on réessaiera
    const painted = (x) => livery.some((n) => ` ${words(x.title)} `.includes(` ${words(n)} `));
    const fair = (x) => !revealsAnswer(x.author, name) && !revealsAnswer(x.author, model) && !(livery || []).some((n) => flat(x.author).includes(flat(n)));
    const out = [];
    const ok = (x) => x.safe && fair(x); // quiz : licences sans risque seulement
    const groups = livery ? [sets.reg.filter(painted), sets.airline.filter(painted)] : [sets.reg, sets.airline, sets.model.filter(ok).slice(0, 10)];
    for (const t of groups) for (const x of shuffled(t.filter(ok))) {
      const url = credited(x);
      if (!out.includes(url)) out.push(url);
    }
    return out;
  })());
  return quizMem.get(key);
}

/**
 * Photos libres d'un avion pour sa fiche et sa vignette du Scanner (même photo en premier : le crédit de la vignette est
 * celui de la fiche ouverte au toucher), la fiche en direct, la publication du feed : cet appareil précis, sinon le même
 * modèle aux couleurs de sa compagnie. Licences sans risque d'abord, puis CC 2.0–3.0 (usableLicense), auteur connu,
 * crédit gardé. { urls, exact, company } (exact = photos de cet appareil), ou null s'il n'y en a pas (la fiche montre
 * alors seulement la photo de l'article Wikipédia du modèle). Remplace les photos airport-data (pas de licence libre).
 * Résultat gardé 7 jours (2 jours s'il n'y a rien) dans `aircraft_photos_v3` ; low = recherche de vignette (moins pressée).
 */
const AP_KEY = "aircraft_photos_v4", AP_MAX = 250; // v3 : filtre NOT_A_PLANE par mots entiers (Eurowings, Seattle…) ; v4 : 5 photos (remplaçantes des photos signalées)
try { localStorage.removeItem("aircraft_photos_v1"); localStorage.removeItem("aircraft_photos_v2"); } catch { /* stockage bloqué */ }
const apMem = new Map();
/** Photos signalées par les joueurs (acflags.js) écartées ; null s'il n'en reste aucune. */
const unflagged = (r) => {
  if (!r) return r;
  const urls = r.urls.filter((u) => !AcFlags.has(u));
  return urls.length ? { ...r, urls } : null;
};
export function aircraftPhotos(ctx, opts) {
  return rawAircraftPhotos(ctx, opts).then(unflagged);
}
function rawAircraftPhotos(ctx, { low = false } = {}) {
  const key = [flat(ctx.registration), flat(airlineName(ctx.airline)), modelCore(ctx.model) || ""].join("|");
  if (apMem.has(key)) return apMem.get(key);
  const hit = ls.get(AP_KEY, {})?.[key];
  if (hit && Date.now() - (hit.at || 0) < (hit.r ? 7 : 2) * 864e5) { const p = Promise.resolve(hit.r); apMem.set(key, p); return p; }
  const p = (async () => {
    const sets = await commonsSets(ctx, false, low);
    const exact = sets.reg.length > 0, list = exact ? sets.reg : sets.airline;
    const sorted = [...list.filter((x) => x.safe), ...list.filter((x) => !x.safe)];
    const r = sorted.length ? { urls: [...new Set(sorted.slice(0, 5).map(credited))], exact, company: sets.company } : null;
    if (sets.failed) apMem.delete(key); // hors ligne : on réessaiera
    else {
      const all = ls.get(AP_KEY, {}) || {};
      all[key] = { at: Date.now(), r };
      const keys = Object.keys(all);
      if (keys.length > AP_MAX) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - AP_MAX).forEach((k) => delete all[k]);
      ls.set(AP_KEY, all);
    }
    return r;
  })();
  apMem.set(key, p);
  return p;
}
/** Photos sous licence sans risque (credits.js) d'abord, les autres ensuite (affichées avec leur crédit complet). */
const safeFirst = (list) => [...list.filter((x) => safeLicense(x.license)), ...list.filter((x) => !safeLicense(x.license))];

/** Une photo du modèle sur Commons : [miniature 400 px, grande 1024 px] ; safeOnly = seulement licence sans risque. */
export async function commonsPhoto(query, { safeOnly = false } = {}) {
  const list = safeFirst(await commonsSearch(query, 8, 400));
  const p = safeOnly ? list.find((x) => safeLicense(x.license)) : list[0];
  return p ? [wmSize(p.thumb, 330), wmSize(p.thumb, 960)] : null;
}
/**
 * Plusieurs photos d'un modèle sur Wikimedia Commons (JPEG, 800 px), pour remplacer une photo du quiz signalée
 * ou introuvable ; licences sans risque d'abord.
 */
export async function commonsPhotos(query, limit = 15) {
  return safeFirst(await commonsSearch(query, limit, 960)).map((x) => x.thumb);
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

/**
 * Photo de l'article sous une licence ancienne (CC BY-SA 2.0, 3.0…) : on prend plutôt une photo du même modèle sous
 * licence sans risque (domaine public, CC0, Creative Commons 4.0) si Commons en a une ; sinon on garde celle de
 * l'article, affichée avec son crédit complet (credits.js). Licence inconnue (hors ligne) : on garde.
 */
async function preferSafePhoto(s) {
  if (!s?.thumbnailUrl) return s;
  const c = await photoCredit(s.thumbnailUrl).catch(() => null);
  if (!c?.license || safeLicense(c.license)) return s;
  const p = await safe(commonsPhoto(s.title, { safeOnly: true }));
  return p ? { ...s, thumbnailUrl: p[0], imageUrl: p[1] } : s;
}

// v4 : photos choisies selon leur licence (preferSafePhoto) ; l'ancien cache est effacé
const WIKI_KEY = "wiki_cache_v4" + (LANG === "fr" ? "" : "_" + LANG), RETRY_MS = 7 * 86400e3;
try { localStorage.removeItem("wiki_cache_v3" + (LANG === "fr" ? "" : "_" + LANG)); } catch { /* stockage bloqué */ }
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
        if (s) s = await preferSafePhoto(await withPhoto(s));
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
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&layer=address&limit=8"
      + `&accept-language=${LANG}&q=${encodeURIComponent(q)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const seen = new Set();
    // Lieux du pays du joueur d'abord (« 92350 » existe en France, en Finlande, aux États-Unis…)
    const mine = (String(navigator.language || "").split("-")[1] || (LANG === "fr" ? "fr" : "")).toLowerCase();
    const list = (await r.json()).sort((a, b) => (b.address?.country_code === mine) - (a.address?.country_code === mine));
    return list.map((x) => {
      const a = x.address || {};
      const name = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || x.name || String(x.display_name).split(",")[0];
      const detail = [a.postcode, a.county || a.state_district, a.state, a.country].filter((v, i, l) => v && v !== name && l.indexOf(v) === i).join(", ");
      return { lat: parseFloat(x.lat), lon: parseFloat(x.lon), place: name, detail };
    }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && !seen.has(p.place + p.detail) && seen.add(p.place + p.detail)).slice(0, 5);
  },
};

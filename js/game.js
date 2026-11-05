// Règles du jeu : rareté, grades, XP, pays, approche, quiz.
import { D } from "./data.js";
import { CATALOG_ROWS } from "./catalog-data.js";
import { distanceKm, meters, dec, direction } from "./util.js";

// ---------- Rareté ----------
export const RARITIES = [
  { key: "COMMUN", label: "Commun", xp: 10, color: "var(--r-common)" },
  { key: "PEU_COMMUN", label: "Peu commun", xp: 25, color: "var(--r-uncommon)" },
  { key: "RARE", label: "Rare", xp: 60, color: "var(--r-rare)" },
  { key: "EPIQUE", label: "Épique", xp: 150, color: "var(--r-epic)" },
  { key: "LEGENDAIRE", label: "Légendaire", xp: 400, color: "var(--r-legendary)" },
].map((r, i) => ({ ...r, ordinal: i, stars: "★".repeat(i + 1) }));
export const Rarity = Object.fromEntries(RARITIES.map((r) => [r.key, r]));
export const rarityByName = (n) => Rarity[n] || Rarity.COMMUN;

const legendary = new Set(D.legendary), epic = new Set(D.epic), rareCivil = new Set(D.rareCivil), uncommon = new Set(D.uncommon);
const sets = Object.fromEntries(["helicopters", "business", "widebody", "light", "airliners"].map((k) => [k, new Set(D[k])]));

export function rarityOf(type, military, interesting = false, category = "") {
  const t = (type || "").trim().toUpperCase();
  if (legendary.has(t)) return Rarity.LEGENDAIRE;
  if (epic.has(t)) return Rarity.EPIQUE;
  if (military) return Rarity.RARE;
  if (interesting || rareCivil.has(t)) return Rarity.RARE;
  // Peu commun : long-courriers, aviation d'affaires, aviation légère et hélicoptères
  if (uncommon.has(t) || sets.widebody.has(t) || sets.business.has(t) || sets.light.has(t) || sets.helicopters.has(t)
    || ["A1", "A7", "B1", "B4"].includes(category)) return Rarity.PEU_COMMUN;
  return Rarity.COMMUN;
}
export const rarityOfAc = (ac) => rarityOf(ac.type, ac.military, ac.interesting, ac.category);

// ---------- Grades ----------
export const LEVELS = D.levels.map(([minXp, name], i) => ({
  number: i + 1, name, minXp, nextXp: D.levels[i + 1]?.[0] ?? null, emblem: "",
  get title() { return name; },
}));
export function levelOf(xp) {
  let i = 0;
  LEVELS.forEach((l, j) => { if (xp >= l.minXp) i = j; });
  return LEVELS[i];
}

// ---------- Pays ----------
/** Drapeau du pays : retiré du style « Instrument » (le nom du pays reste écrit). */
export function flagOf() { return ""; }
export function countryFromHex(hex) {
  const v = parseInt((hex || "").trim().replace(/^~/, ""), 16);
  if (Number.isNaN(v)) return null;
  const r = D.ranges.find(([a, b]) => v >= a && v <= b);
  return r ? { iso: r[2], name: r[3], flag: flagOf(r[2]), label: r[3] } : null;
}
export const capitalOf = (iso) => D.capitals[(iso || "").toUpperCase()] || null;

// ---------- Noms de modèles ----------
const militaryCallsign = new RegExp(D.militaryCallsign);
export const looksMilitary = (cs) => militaryCallsign.test((cs || "").trim().toUpperCase());

/** "AIRBUS A-400M Atlas" -> "Airbus A400M Atlas" */
export function prettyModel(raw) {
  const d = (raw || "").trim().replace(/\s+/g, " ");
  if (!d) return d;
  return d.split(" ").map((w) => {
    const fixed = w.replace(/^([A-Za-z])-(\d)/, "$1$2");
    if (![...fixed].some((c) => c !== c.toUpperCase()) && !/\d/.test(fixed) && fixed.length > 3)
      return fixed.charAt(0) + fixed.slice(1).toLowerCase();
    return fixed;
  }).join(" ");
}

/** Formulations pour trouver l'article Wikipédia du modèle (comme MilitaryTypes.modelQueries). */
export function modelQueries(type, description, military, info) {
  const code = (type || "").trim().toUpperCase();
  const out = new Set();
  if (military && D.militaryOnlyTypes[code]) out.add(D.militaryOnlyTypes[code]);
  if (D.wikiByType[code]) out.add(D.wikiByType[code]);
  if (D.civilTypes[code] && (!military || !D.militaryOnlyTypes[code])) out.add(D.civilTypes[code]);
  // Titre de l'article choisi pour ce code dans le catalogue (305 modèles vérifiés), version militaire ou civile
  const inCatalog = CATALOG.filter((c) => c.codes.includes(code) && (!c.militaryOnly || military));
  const best = inCatalog.find((c) => c.military === !!military) || inCatalog[0];
  if (best) out.add(best.wiki);
  const fromInfo = info ? prettyModel(`${info.manufacturer} ${info.model}`) : "";
  const desc = prettyModel(description) || fromInfo;
  if (desc) {
    out.add(desc);
    const words = desc.split(" ").filter(Boolean);
    if (words.length >= 2) {
      const [maker, model] = words;
      const base = (model.split("-")[0] || model).replace(/(neo|ceo|max)$/i, "");
      out.add(`${maker} ${model}`);
      if (base.length >= 2) out.add(`${maker} ${base}`);
    }
  }
  if (fromInfo && fromInfo !== desc) out.add(fromInfo);
  if (code) out.add(`${code} aircraft`);
  return [...out];
}

// ---------- Avions célèbres et modèles ----------
export const FAMOUS = D.famous.map((f) => {
  const rarity = rarityOf(f.codes[0], f.military);
  const base = rarity.xp, withDist = Math.floor(base * 2.5);
  return { ...f, rarity, baseXp: base, maxXp: withDist + Math.floor(withDist / 2) };
}).sort((a, b) => b.rarity.ordinal - a.rarity.ordinal);
export const famousMatches = (f, type, isMil) => f.codes.includes((type || "").trim().toUpperCase()) && (!f.military || isMil);

// ---------- Catalogue complet (catalog-data.js) ----------
export { THEMES } from "./catalog-data.js";
const MIL_THEMES = new Set(["FIGHTER", "TRAINER", "MILTRANS", "SURV", "BOMBER", "MILHELI"]);
const THEME_CATEGORY = { LIGHT: "A1", HELI: "A7", MILHELI: "A7" };
/** XP maximum d'un modèle : vol de plus de 6 000 km (×2,5) et première photo du modèle (+50 %). */
export const maxXpOf = (base) => { const d = Math.floor(base * 2.5); return d + Math.floor(d / 2); };
const SHARED = (() => { const n = {}; CATALOG_ROWS.forEach(([c]) => c.split(" ").forEach((x) => { n[x] = (n[x] || 0) + 1; }));
  return new Set(Object.keys(n).filter((x) => n[x] > 1)); })();
export const CATALOG = CATALOG_ROWS.map(([codes, name, maker, theme, o = {}], i) => {
  const list = codes.split(" "), military = !!o.m || MIL_THEMES.has(theme);
  const rarity = list.map((c) => rarityOf(c, military, false, THEME_CATEGORY[theme] || ""))
    .reduce((a, b) => (b.ordinal > a.ordinal ? b : a));
  // Avion célèbre rattaché ; si le code est partagé (A330 / A330 MRTT), la version militaire ou civile doit correspondre
  const cands = D.famous.filter((f) => list.includes(f.codes[0]));
  const famous = cands.find((f) => f.military === military) || (cands.length && !SHARED.has(cands[0].codes[0]) ? cands[0] : null);
  return { id: i, codes: list, name, maker, theme, military, militaryOnly: !!o.mo, wiki: o.w || name,
    rarity, baseXp: rarity.xp, maxXp: maxXpOf(rarity.xp), famous };
});
/** Tous les codes de type d'avion connus du jeu (catalogue et listes de data.js) ; les autres sont recensés (census.js). */
export const KNOWN_TYPES = new Set([
  ...CATALOG.flatMap((c) => c.codes),
  ...D.legendary, ...D.epic, ...D.rareCivil, ...D.uncommon, ...D.helicopters, ...D.business, ...D.widebody, ...D.light, ...D.airliners,
  ...D.models.flatMap((m) => m.codes), ...D.famous.flatMap((f) => f.codes), ...D.tipsByCode.flatMap(([codes]) => codes),
  ...Object.keys(D.wikiByType), ...Object.keys(D.civilTypes), ...Object.keys(D.militaryOnlyTypes),
].map((c) => String(c).trim().toUpperCase()));
/** Une photo (type, militaire ?) correspond-elle à ce modèle du catalogue ? */
export const catalogMatches = (c, type, isMil) => c.codes.includes((type || "").trim().toUpperCase()) && (!c.militaryOnly || isMil);
/** Lien vers l'article Wikipédia (ouvre l'article s'il existe, sinon la recherche). */
export const wikiLink = (title) => `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(title)}&go=Go`;


export const KINDS = [
  { key: "MILITARY", emoji: "", label: "Militaires" },
  { key: "RARE", emoji: "★", label: "Rares et spéciaux (★★★ et plus)" },
  { key: "AIRLINER", emoji: "", label: "Avions de ligne" },
  { key: "WIDEBODY", emoji: "", label: "Gros porteurs et cargos" },
  { key: "BUSINESS", emoji: "", label: "Aviation d'affaires" },
  { key: "HELICOPTER", emoji: "", label: "Hélicoptères" },
  { key: "LIGHT", emoji: "", label: "Aviation légère" },
];

export function kindMatches(k, ac) {
  const t = (ac.type || "").trim().toUpperCase(), c = (ac.category || "").toUpperCase();
  switch (k) {
    case "MILITARY": return ac.military;
    case "RARE": return rarityOfAc(ac).ordinal >= Rarity.RARE.ordinal;
    case "HELICOPTER": return c === "A7" || sets.helicopters.has(t);
    case "BUSINESS": return sets.business.has(t);
    case "WIDEBODY": return c === "A5" || sets.widebody.has(t);
    case "AIRLINER": return !ac.military && (sets.airliners.has(t) || (c === "A3" && !sets.business.has(t)));
    case "LIGHT": return !sets.helicopters.has(t) && !sets.business.has(t) && (["A1", "B1", "B4"].includes(c) || sets.light.has(t));
  }
  return false;
}

export function familyOf(type, military, category = "") {
  const t = (type || "").trim().toUpperCase();
  if (military) return "MILITARY";
  if (category === "A7" || sets.helicopters.has(t)) return "HELICOPTER";
  if (sets.business.has(t)) return "BUSINESS";
  if (category === "A5" || sets.widebody.has(t)) return "WIDEBODY";
  if (sets.airliners.has(t) || category === "A3") return "AIRLINER";
  return "LIGHT";
}

/** Modèles choisissables (filtre de notifications, quiz), triés par nom. */
export const MODELS = (() => {
  const list = D.models.map((m) => ({ label: m.label, codes: m.codes, militaryOnly: false, military: m.military }));
  for (const f of D.famous) list.push({ label: f.name, codes: f.codes, militaryOnly: f.military && f.codes[0] === "A332", military: f.military });
  const seen = new Set();
  return list.filter((m) => !seen.has(m.label) && seen.add(m.label))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
})();
/** L'avion correspond-il à un des types OU à un des modèles choisis ? (notifications, liste du Scanner) */
export const filterMatches = (ac, kinds, models) =>
  kinds.some((k) => kindMatches(k, ac)) || MODELS.some((m) => models.includes(m.label) && modelMatches(m, ac));
export const modelMatches = (m, ac) => m.codes.includes((ac.type || "").trim().toUpperCase()) && (!m.militaryOnly || ac.military);

// ---------- Ce qui a été vu (Spotted) et XP ----------
export const MAX_PHOTO_KM = 30;

export function spottedFrom(ac, extra, userLat, userLon) {
  const info = extra?.info, route = extra?.route;
  const country = countryFromHex(ac.hex);
  const refLat = ac.lat ?? userLat, refLon = ac.lon ?? userLon;
  const o = route?.origin;
  const fromAirport = o?.lat != null && o?.lon != null && refLat != null && refLon != null;
  let flightKm = null;
  if (fromAirport) flightKm = distanceKm(o.lat, o.lon, refLat, refLon);
  else if (refLat != null && refLon != null) {
    const cap = capitalOf(country?.iso || info?.countryIso);
    if (cap) flightKm = distanceKm(cap[0], cap[1], refLat, refLon);
  }
  return {
    hex: ac.hex, callsign: ac.callsign, registration: ac.registration, type: ac.type,
    model: ac.description || (info ? `${info.manufacturer} ${info.model}`.trim() : ""),
    operator: info?.owner || ac.operator || "",
    countryIso: country?.iso || info?.countryIso || "", countryName: country?.name || info?.countryName || "",
    military: ac.military, interesting: ac.interesting, category: ac.category, distanceKm: ac.distanceKm,
    route: route ? `${airportLabel(route.origin)} → ${airportLabel(route.destination)}` : "",
    flightKm, flightFromAirport: fromAirport,
    // Position de l'observateur au moment du passage (vérification du lieu des photos)
    obsLat: userLat ?? null, obsLon: userLon ?? null,
  };
}
export const spottedRarity = (s) => rarityOf(s.type, s.military, s.interesting, s.category);
export const modelKey = (x) => ((x.type || "") || (x.model || "")).toUpperCase();

export function airportLabel(a) {
  const code = a.iata || a.icao, place = a.city || a.name;
  return code ? `${place} (${code})` : place;
}

export function distanceBonus(km) {
  if (km == null) return { mult: 1, label: "distance du vol inconnue" };
  if (km < 300) return { mult: 1, label: "vol local" };
  if (km < 1000) return { mult: 1.2, label: "vol régional" };
  if (km < 3000) return { mult: 1.5, label: "moyen-courrier" };
  if (km < 6000) return { mult: 2, label: "long-courrier" };
  return { mult: 2.5, label: "très long-courrier" };
}

/** XP d'une photo : rareté × distance du vol, +50 % nouveau modèle (comme XpCalc). */
export function computeXp(s, { hasModel, countForHex }) {
  const rarity = spottedRarity(s);
  const dist = distanceBonus(s.flightKm);
  const withDistance = Math.floor(rarity.xp * dist.mult);
  const newModel = !hasModel(modelKey(s));
  const bonus = newModel ? Math.floor(withDistance / 2) : 0;
  let zero = null;
  if (countForHex(s.hex) > 0) zero = "Cet avion est déjà dans votre collection";
  else if (s.distanceKm == null || s.distanceKm > MAX_PHOTO_KM) zero = `L'avion était à plus de ${MAX_PHOTO_KM} km de vous`;
  return {
    rarity, base: rarity.xp, distance: dist, flightKm: s.flightKm, withDistance,
    newModelBonus: zero ? 0 : bonus, total: zero ? 0 : withDistance + bonus, zeroReason: zero,
  };
}

export function describeXp(r) {
  let s = `${r.rarity.stars} ${r.rarity.label} : ${r.base} XP`;
  if (r.distance.mult !== 1 && r.flightKm != null)
    s += `\n${r.distance.label} (${Math.round(r.flightKm).toLocaleString("fr-FR")} km) : ×${String(r.distance.mult).replace(".", ",")}`;
  if (r.newModelBonus > 0) s += `\n🆕 Nouveau modèle : +${r.newModelBonus} XP`;
  return s;
}

// ---------- Approche (compte à rebours « visible dans… ») ----------
/** Hélicoptère ? (il peut changer de cap ou rester sur place : les prévisions sont incertaines) */
export const isHelicopter = (ac) => kindMatches("HELICOPTER", ac);
/**
 * En descente vers une piste ? Temps (s) avant de toucher le sol à la vitesse verticale actuelle, sinon null.
 * Seulement sous 12 000 ft et à plus de 300 ft/min de descente (approche finale), pour ne pas confondre avec une simple descente de croisière.
 */
export function landingInS(ac) {
  const alt = ac.altitudeFt, vr = ac.vertRateFpm;
  if (ac.onGround || alt == null || vr == null || vr > -300 || alt > 12000) return null;
  return (alt / -vr) * 60;
}

/**
 * Approche d'un avion par rapport à la zone visible à l'œil nu. null pour un avion au sol (pas de trajectoire) ou sans
 * cap/vitesse. kind : NOW (visible), SOON (visible dans toVisible s), FAR (passera trop loin), AWAY (s'éloigne),
 * LANDS (vient vers vous mais atterrit avant, dans tLand s). uncertain = hélicoptère.
 */
export function approach(userLat, userLon, ac, visibleKm) {
  if (ac.lat == null || ac.lon == null || ac.trackDeg == null || ac.speedKt == null) return null;
  if (ac.onGround || ac.speedKt < 30) return null;
  const a = rawApproach(userLat, userLon, ac, visibleKm);
  if (!a) return a;
  if (isHelicopter(ac)) a.uncertain = true;
  // Atterrit avant d'arriver dans la zone visible (ou avant son point le plus proche s'il passe plus loin)
  const tLand = landingInS(ac);
  if (tLand != null && ((a.kind === "SOON" && a.toVisible >= tLand) || (a.kind === "FAR" && a.tClosest >= tLand))) {
    return { ...a, kind: "LANDS", tLand, toVisible: null };
  }
  if (tLand != null) a.tLand = tLand;
  return a;
}
function rawApproach(userLat, userLon, ac, visibleKm) {
  const kmLat = 111.32, kmLon = 111.32 * Math.cos((userLat * Math.PI) / 180);
  const px = (ac.lon - userLon) * kmLon, py = (ac.lat - userLat) * kmLat;
  const v = (ac.speedKt * 1.852) / 3600, tr = (ac.trackDeg * Math.PI) / 180;
  const vx = v * Math.sin(tr), vy = v * Math.cos(tr), vv = vx * vx + vy * vy;
  const d0 = Math.hypot(px, py), pv = px * vx + py * vy;
  const tClosest = Math.max(0, -pv / vv), closest = Math.hypot(px + vx * tClosest, py + vy * tClosest);
  const r = visibleKm;
  // Où regarder : cap (0 = nord, 90 = est) et hauteur au-dessus de l'horizon de l'avion à l'instant t (s)
  const altKm = ac.altitudeFt != null ? (ac.altitudeFt * 0.3048) / 1000 : null;
  const look = (t) => {
    const x = px + vx * t, y = py + vy * t, d = Math.hypot(x, y);
    return { lookDeg: ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360,
      lookElev: altKm != null ? (Math.atan2(altKm, Math.max(d, 0.05)) * 180) / Math.PI : null };
  };
  if (d0 <= r) return { kind: "NOW", toVisible: 0, closest, tClosest, ...look(0) };
  if (pv >= 0 || tClosest > 45 * 60) return { kind: "AWAY", toVisible: null, closest, tClosest, ...look(0) };
  if (closest > r) return { kind: "FAR", toVisible: null, closest, tClosest, ...look(tClosest) };
  const disc = pv * pv - vv * (d0 * d0 - r * r);
  const t = Math.max(0, (-pv - Math.sqrt(Math.max(0, disc))) / vv);
  return { kind: "SOON", toVisible: t, closest, tClosest, ...look(t) };
}
/** « Regardez au nord-est (cap 47°), à 25° au-dessus de l'horizon » */
export function lookLabel(a) {
  if (a?.lookDeg == null) return "";
  let s = `Regardez ${direction(a.lookDeg)} (cap ${Math.round(a.lookDeg) % 360}°)`;
  if (a.lookElev != null) {
    const e = Math.round(a.lookElev);
    s += e >= 75 ? ", presque au-dessus de vous" : e < 8 ? `, très bas sur l'horizon (${e}°)` : `, à ${e}° au-dessus de l'horizon`;
  }
  return s;
}
export function duration(sec) {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  if (s >= 60) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${s} s`;
}
export function approachLabel(a, elapsed) {
  const look = lookLabel(a);
  switch (a.kind) {
    case "NOW": return "Visible maintenant — levez les yeux !\n" + look;
    case "SOON": { const left = a.toVisible - elapsed; return (left <= 0 ? "Devrait être visible maintenant" : `Visible dans ${duration(left)}`) + "\n" + look; }
    case "FAR": return `Se rapproche, passera à ${Math.round(a.closest)} km dans ${duration(a.tClosest - elapsed)}\n${look}`;
    case "LANDS": return `En approche pour atterrir : il devrait toucher le sol dans ${duration(Math.max(0, a.tLand - elapsed))}, avant d'arriver dans votre zone visible.`;
    default: return "S'éloigne";
  }
}
/** Phrase ajoutée aux prévisions d'un hélicoptère. */
export const UNCERTAIN_TEXT = "Estimation incertaine : un hélicoptère peut changer de direction ou rester sur place.";
export const approachSortKey = (a) => (!a ? 300000 : a.kind === "NOW" ? 0 : a.kind === "SOON" ? 1 + a.toVisible
  : a.kind === "FAR" ? 100000 + a.closest : a.kind === "LANDS" ? 150000 : 200000);

// ---------- Formats d'avion ----------
export const acLabel = (ac) => ac.callsign || ac.registration || (ac.hex || "").toUpperCase();
export function fmtDistance(ac) {
  if (ac.distanceKm == null) return "position inconnue";
  return `${dec(ac.distanceKm)} km${ac.bearingDeg != null ? ` ${direction(ac.bearingDeg)} (${Math.round(ac.bearingDeg) % 360}°)` : ""}`;
}
export function fmtAltitude(ac) {
  if (ac.onGround) return "au sol";
  if (ac.altitudeFt != null) return `${Math.round(ac.altitudeFt * 0.3048).toLocaleString("fr-FR")} m (${ac.altitudeFt.toLocaleString("fr-FR")} ft)`;
  return "altitude inconnue";
}
export const fmtSpeed = (ac) => (ac.speedKt != null ? `${Math.round(ac.speedKt * 1.852)} km/h` : "—");
export function fmtOrigin(ac, extra) {
  if (extra?.route) return `${airportLabel(extra.route.origin)} → ${airportLabel(extra.route.destination)}`;
  const country = countryFromHex(ac.hex)?.label || extra?.info?.countryName || null;
  const owner = extra?.info?.owner || ac.operator || null;
  return [country, owner].filter(Boolean).join(" • ");
}

// ---------- Quiz ----------
export const Quiz = {
  BASE_XP: 5,
  MAX_MULT: 5,
  // Rayon de jeu par grade ; au grade 8, radar infini (tous les avions que la source ADS-B peut donner, ~460 km)
  RADIUS_KM: [1, 5, 7, 10, 15, 25, 30, Infinity],
  radiusKm: (lvl) => Quiz.RADIUS_KM[Math.min(Math.max(lvl.number - 1, 0), 7)],
  multiplier: (streak) => Math.min(Quiz.MAX_MULT, 1 + Math.floor(streak / 5)),
  kmLabel: (km) => (Number.isFinite(km) ? meters(km * 1000) : "infini"),
  radiusLabel: (lvl) => Quiz.kmLabel(Quiz.radiusKm(lvl)),
  // Questions bonus du quiz en direct, sur l'avion reconnu (d'après Wikipédia, wikiquiz.js) : 1 au grade 4, 2 au grade 5…
  BONUS_XP: 3,
  bonusCount: (lvl) => Math.max(0, (lvl?.number || 0) - 3),
  bonusLabel: (lvl) => { const n = Quiz.bonusCount(lvl); return n ? `${n} question${n > 1 ? "s" : ""} bonus` : ""; },
};

const EXTRA_NAMES = [
  ["Diamond DA40", "LIGHT"], ["Diamond DA42", "LIGHT"], ["Piper PA-28 Cherokee", "LIGHT"], ["Cirrus SR22", "LIGHT"],
  ["Socata TB-20 Trinidad", "LIGHT"], ["Tecnam P2008", "LIGHT"], ["Cessna 152", "LIGHT"], ["Piper PA-34 Seneca", "LIGHT"],
  ["Beechcraft King Air", "BUSINESS"], ["Embraer Phenom 300", "BUSINESS"], ["Learjet 45", "BUSINESS"], ["Pilatus PC-24", "BUSINESS"],
  ["Airbus H160", "HELICOPTER"], ["Leonardo AW139", "HELICOPTER"], ["Airbus H125", "HELICOPTER"], ["Bell 407", "HELICOPTER"],
  ["Fokker 100", "AIRLINER"], ["Boeing 717", "AIRLINER"],
];
const POOL = [
  ...MODELS.map((m) => ({ name: m.label, kind: familyOf(m.codes[0], m.military), codes: m.codes })),
  ...EXTRA_NAMES.map(([name, kind]) => ({ name, kind, codes: [] })),
];

export function quizName(ac, extra) {
  const t = (ac.type || "").trim().toUpperCase();
  const known = MODELS.find((m) => modelMatches(m, ac)) || MODELS.find((m) => m.codes.includes(t) && !m.militaryOnly);
  if (known) return known.label;
  const raw = ac.description || (extra?.info ? `${extra.info.manufacturer} ${extra.info.model}`.trim() : "");
  const p = prettyModel(raw).trim();
  return p.length >= 3 && t !== "ZZZZ" ? p : null;
}

/** Comment reconnaître un avion du quiz : note propre au modèle, sinon au code de type ; null si aucune. */
const TIP_BY_CODE = new Map(D.tipsByCode.flatMap(([codes, tip]) => codes.map((c) => [c, tip])));
export function recognitionTip(name, type) {
  return D.tips[name] || TIP_BY_CODE.get((type || "").trim().toUpperCase()) || null;
}
/** Conseil général selon la famille (avion de ligne, hélicoptère…), quand aucune note précise n'existe. */
export const familyTip = (kind) => D.tipsByFamily[kind] || D.tipsByFamily.AIRLINER;

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export function buildQuestion(ac, extra, photoUrl) {
  const answer = quizName(ac, extra);
  if (!answer) return null;
  const kind = familyOf(ac.type, ac.military, ac.category), t = (ac.type || "").trim().toUpperCase();
  const ok = (n) => n.name !== answer && !n.codes.includes(t) &&
    !n.name.toLowerCase().includes(answer.toLowerCase()) && !answer.toLowerCase().includes(n.name.toLowerCase());
  const wrong = [...new Set([...shuffle(POOL.filter((n) => n.kind === kind && ok(n))), ...shuffle(POOL.filter((n) => n.kind !== kind && ok(n)))].map((n) => n.name))].slice(0, 3);
  if (wrong.length < 3) return null;
  return { hex: ac.hex, answer, options: shuffle([...wrong, answer]), photoUrl, type: t, kind,
    distanceKm: ac.distanceKm, altitudeM: ac.altitudeFt != null ? Math.round(ac.altitudeFt * 0.3048) : null, askedAt: Date.now() };
}

// Jeu « Sur la carte » (onglet Jeux) : trois défis qui alternent, sur la carte du monde, avec les avions en vol autour du joueur.
//  - Passage : l'un des avions passera à X km de lui dans Y minutes, lequel ?
//  - Destination : un avion, d'où il vient, son cap, sa vitesse, son vol restant ; toucher la carte là où il va atterrir.
//  - Altitude : lequel vole le plus haut ? (modèle et vitesse affichés, altitude dévoilée après la réponse)
// Difficulté et gains selon le grade (FLY_LEVELS), série de bonnes réponses avec multiplicateur, et bonus
// « Vérifié en vrai » si l'on photographie ensuite l'avion trouvé (Hunts, store.js). Une fois par avion et par jour.
// Calcul : approach() de game.js (ligne droite à la vitesse sol, comme le Scanner), position exacte du téléphone.
import { LOCALE, LANG } from "../i18n.js";
import { h, toast, cardinal, bearingDeg, distanceKm, ls } from "../util.js";
import { Radar } from "../radar.js";
import { Adsb, AdsbDb, Wiki } from "../net.js";
import { QuizStore, Player, Prefs, Hunts, HUNT_XP } from "../store.js";
import { Sound } from "../sound.js";
import { approach, acLabel, prettyModel, fmtSpeed, fmtAltitude, isHelicopter } from "../game.js";
import { locationBadge, wikiQuery } from "../ui.js";
import { renderHud } from "../app.js";
import { sync } from "../cloud.js";
import { loadMap, worldMap, ring, ahead, arc, cone } from "../worldmap.js";

const MIN_T = 90, MAX_T = 25 * 60, MAX_CLOSEST = 40; // l'avion à trouver : passe dans 1 min 30 à 25 min, à 40 km au plus
const LETTERS = "ABCDEFGHIJKL";

// ---------- Difficulté selon le grade ----------
// tol = écart minimal entre l'avion à trouver et les autres (km, part de la distance, secondes, part du temps) :
// plus il est grand, plus les leurres sont faciles à écarter.
// ft = écart minimal d'altitude entre le plus haut et les autres (défi Altitude).
const TOL = {
  large: { km: 8, kr: 0.6, s: 300, sr: 0.45, ft: 5000 },
  moyenne: { km: 5, kr: 0.4, s: 210, sr: 0.3, ft: 3000 },
  serree: { km: 3, kr: 0.25, s: 150, sr: 0.2, ft: 2000 },
  fine: { km: 2, kr: 0.15, s: 120, sr: 0.15, ft: 1200 }, // jamais moins de 2 min d'écart si les distances se ressemblent : l'énoncé est arrondi à la minute
};
export const FLY_LEVELS = [ // grades 1 à 8
  { n: 5, ring: true, speed: true, cap: true, tol: TOL.large },
  { n: 5, ring: true, speed: true, cap: true, tol: TOL.large },
  { n: 7, ring: true, speed: true, cap: false, tol: TOL.moyenne },
  { n: 7, ring: true, speed: true, cap: false, tol: TOL.moyenne },
  { n: 9, ring: false, speed: true, cap: false, tol: TOL.serree },
  { n: 9, ring: false, speed: true, cap: false, tol: TOL.serree },
  { n: 11, ring: false, speed: false, cap: false, tol: TOL.fine },
  { n: 12, ring: false, speed: false, cap: false, tol: TOL.fine },
].map((l, i) => ({ ...l, grade: i + 1, xp: 10 + Math.round((i * 10) / 7) })); // 10 XP au grade 1 → 20 XP au grade 8
export const flyLevel = (grade) => FLY_LEVELS[Math.min(Math.max((grade || 1) - 1, 0), 7)];
const myLevel = () => flyLevel(Player.level().number);

// ---------- Série ----------
// Bonnes réponses d'affilée (premier ou deuxième essai) ; une erreur remet à zéro. ×2 après 3, ×3 après 6… ×5 au plus.
export const multiplier = (streak) => Math.min(5, 1 + Math.floor(streak / 3));
const Stats = {
  get: () => ({ streak: 0, best: 0, ...ls.get("flyby_stats", {}) }),
  set: (v) => ls.set("flyby_stats", v),
};
/** Verse les points (la base refuse plus de 50 points par ligne : on découpe). */
function award(points, tag) {
  for (let left = points, i = 0; left > 0; i++) { const p = Math.min(50, left); QuizStore.addAward(p, i ? `${tag}:${i + 1}` : tag); left -= p; }
}
/** Assez près pour être vu à l'œil nu (zone visible du Scanner, 8 km au moins pour un avion de ligne en altitude) ? */
const huntable = (a) => a.closest <= Math.max(Prefs.visibleM / 1000, 8);

// Bonus « Vérifié en vrai » versé à la capture (store.js) : on le signale où que l'on soit dans l'appli
window.addEventListener("planego-hunt", (e) => {
  toast(`Vérifié en vrai : +${e.detail.xp} XP`);
  import("../app.js").then((m) => m.renderHud()).catch(() => {});
});
const dayTag = () => new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
const tagOf = (ac) => `pass:${ac.hex}:${dayTag()}`;
const altTag = (ac) => `alt:${ac.hex}:${dayTag()}`;
const destTag = (ac) => `dest:${ac.hex}:${(ac.callsign || "").trim()}:${dayTag()}`;
const playedThisSession = new Set();

/** Distance arrondie comme dans l'énoncé (on compare la réponse à ce que le joueur a lu). */
const kmText = (km) => (km < 10 ? String(Math.max(1, Math.round(km))) : String(Math.round(km / 5) * 5));
const minText = (s) => String(Math.max(1, Math.round(s / 60)));

/** Deux passages trop proches pour être distingués (distance et heure presque pareilles) ? */
function ambiguous(a, b, t = TOL.moyenne) {
  return Math.abs(a.closest - b.closest) <= Math.max(t.km, t.kr * a.closest) && Math.abs(a.tClosest - b.tClosest) <= Math.max(t.s, t.sr * a.tClosest);
}

/** Choisit l'avion à trouver et ses leurres (lvl.n avions en tout), dont le plus possible semblent aller vers le joueur. */
export function buildQuestion(loc, list, lvl = flyLevel(5)) {
  const items = list
    .filter((ac) => !ac.onGround && ac.lat != null && ac.trackDeg != null && (ac.speedKt ?? 0) > 80 && !isHelicopter(ac))
    .map((ac) => ({ ac, a: approach(loc.lat, loc.lon, ac, 0.5) }))
    .filter((x) => x.a);
  const approaching = (x) => x.a.kind !== "AWAY" && x.a.kind !== "LANDS";
  const targets = items.filter((x) => approaching(x) && x.a.tClosest >= MIN_T && x.a.tClosest <= MAX_T && x.a.closest <= MAX_CLOSEST
    && !playedThisSession.has(x.ac.hex));
  targets.sort((p, q) => QuizStore.hasAward(tagOf(p.ac)) - QuizStore.hasAward(tagOf(q.ac)) || Math.random() - 0.5);
  for (const target of targets) {
    const towards = (x) => {
      const b = bearingDeg(x.ac.lat, x.ac.lon, loc.lat, loc.lon);
      return Math.abs(((b - x.ac.trackDeg + 540) % 360) - 180) <= 75;
    };
    const decoys = items.filter((x) => x !== target && !ambiguous(target.a, x.a, lvl.tol))
      .map((x) => ({ x, key: (towards(x) ? 0 : 1e6) + (x.ac.distanceKm ?? 0) + Math.random() * 30 }))
      .sort((p, q) => p.key - q.key).slice(0, lvl.n - 1).map((d) => d.x);
    if (decoys.length < Math.min(2, lvl.n - 1)) continue;
    const planes = [target, ...decoys].sort(() => Math.random() - 0.5);
    return { target, planes, at: Date.now() };
  }
  return null;
}

/** Ce que fera vraiment chaque avion (affiché après la réponse). */
function fate(a) {
  if (a.kind === "LANDS") return "Va atterrir avant de passer près de toi";
  if (a.kind === "AWAY") return "S'éloigne de toi";
  return `Passera à ${kmText(a.closest)} km de toi dans ${minText(a.tClosest)} min`;
}


// ---------- Défi Altitude ----------
/** Le plus haut et des leurres plus bas d'au moins lvl.tol.ft pieds (une seule bonne réponse). */
export function buildAltitude(list, lvl = flyLevel(5)) {
  const pool = list.filter((ac) => !ac.onGround && ac.lat != null && ac.altitudeFt != null && ac.altitudeFt > 1000 && !playedThisSession.has(ac.hex));
  const tops = [...pool].sort(() => Math.random() - 0.5)
    .sort((p, q) => QuizStore.hasAward(altTag(p)) - QuizStore.hasAward(altTag(q)));
  for (const top of tops) {
    const below = pool.filter((ac) => ac !== top && ac.altitudeFt <= top.altitudeFt - lvl.tol.ft);
    if (below.length < Math.min(3, lvl.n - 1)) continue;
    // Leurres : d'abord ceux qui volent presque aussi haut (plus difficile), mélangés avec d'autres
    const near = below.sort((p, q) => q.altitudeFt - p.altitudeFt).slice(0, Math.ceil((lvl.n - 1) / 2));
    const rest = below.filter((x) => !near.includes(x)).sort(() => Math.random() - 0.5).slice(0, lvl.n - 1 - near.length);
    const planes = [top, ...near, ...rest].map((ac) => ({ ac })).sort(() => Math.random() - 0.5);
    return { target: planes.find((p) => p.ac === top), planes, at: Date.now() };
  }
  return null;
}

// ---------- Défi Destination ----------
// Trajet : adsbdb (indicatif → aéroports), gardé seulement s'il est plausible (indicatifs parfois réutilisés).
// Le cône aide beaucoup : barème serré, rien au-delà de 600 km ni en dehors du cône (sur 10, × gain du grade / 10)
export const DEST_STEPS = [[25, 10], [50, 9], [100, 8], [150, 7], [250, 5], [400, 3], [600, 1]];
export const destXp = (km) => (DEST_STEPS.find(([max]) => km <= max) || [0, 0])[1];
const DEST_OK_KM = 150; // à moins de 150 km : la série continue
function plausible(ac, route) {
  const o = route?.origin, d = route?.destination;
  if (!o || !d || o.lat == null || d.lat == null || ac.lat == null || ac.trackDeg == null) return false;
  const od = distanceKm(o.lat, o.lon, d.lat, d.lon), op = distanceKm(o.lat, o.lon, ac.lat, ac.lon), pd = distanceKm(ac.lat, ac.lon, d.lat, d.lon);
  if (od < 150 || pd < 80) return false; // trop court, ou presque arrivé
  if (op + pd > od * 1.25 + 120) return false; // l'avion n'est pas sur le trajet
  const diff = Math.abs(((bearingDeg(ac.lat, ac.lon, d.lat, d.lon) - ac.trackDeg + 540) % 360) - 180);
  return diff <= 70;
}
async function buildDestination(list) {
  const pool = list.filter((a) => !a.onGround && !a.military && a.callsign && (a.speedKt ?? 0) > 150 && (a.altitudeFt ?? 0) > 8000
    && !playedThisSession.has(a.hex) && !QuizStore.hasAward(destTag(a)))
    .sort((p, q) => (p.distanceKm ?? 0) - (q.distanceKm ?? 0));
  for (const ac of pool.slice(0, 12)) {
    const route = await AdsbDb.route(ac.callsign).catch(() => null);
    if (plausible(ac, route)) return { ac, route, at: Date.now() };
  }
  return null;
}
let regions = null;
try { regions = new Intl.DisplayNames([LANG], { type: "region" }); } catch { /* navigateur ancien */ }
const countryFr = (a) => { try { return (a.countryIso && regions?.of(a.countryIso.toUpperCase())) || a.countryName; } catch { return a.countryName; } };
const airport = (a) => { const c = countryFr(a); return [a.city || a.name, a.iata || a.icao].filter(Boolean).join(" · ") + (c ? ` (${c})` : ""); };
const hm = (min) => { const m = Math.max(5, Math.round(min / 5) * 5); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`; };
const fact = (label, value) => h("div.dest-fact", h("span.k", label), h("span.v", value));

// ---------- Trajets du défi Altitude ----------
/** Trajet adsbdb gardé seulement si l'avion est à peu près dessus (indicatifs parfois réutilisés). */
function onRoute(ac, route) {
  const o = route?.origin, d = route?.destination;
  if (!o || !d || o.lat == null || d.lat == null || ac.lat == null) return false;
  const od = distanceKm(o.lat, o.lon, d.lat, d.lon);
  return od >= 50 && distanceKm(o.lat, o.lon, ac.lat, ac.lon) + distanceKm(ac.lat, ac.lon, d.lat, d.lon) <= od * 1.25 + 120;
}
/** Ajoute p.route (et la distance parcourue / restante) aux avions qui ont un indicatif ; 6 s au plus. */
async function addRoutes(planes) {
  const one = async (p) => {
    if (!p.ac.callsign) return;
    const r = await AdsbDb.route(p.ac.callsign).catch(() => null);
    if (onRoute(p.ac, r)) p.route = r;
  };
  await Promise.race([Promise.all(planes.map(one)), new Promise((ok) => setTimeout(ok, 6000))]);
}
const short = (a) => a.iata || a.icao || a.city || a.name;
/** « Paris CDG → Madrid MAD · 120 km parcourus, 930 km restants » */
function routeLabel(p) {
  const o = p.route.origin, d = p.route.destination, ac = p.ac;
  const done = Math.round(distanceKm(o.lat, o.lon, ac.lat, ac.lon)), left = Math.round(distanceKm(ac.lat, ac.lon, d.lat, d.lon));
  const city = (a) => [a.city || a.name, short(a)].filter(Boolean).join(" ");
  return `${city(o)} → ${city(d)} · ${done.toLocaleString(LOCALE)} km parcourus, ${left.toLocaleString(LOCALE)} km restants`;
}

// ---------- Alternance des défis ----------
const KINDS = ["pass", "dest", "alt"];
const KIND_LABEL = { pass: "Passage", dest: "Destination", alt: "Altitude" };
const Turn = {
  order() { const i = ls.get("flyby_turn", 0) % KINDS.length; return [...KINDS.slice(i), ...KINDS.slice(0, i)]; },
  played(kind) { ls.set("flyby_turn", (KINDS.indexOf(kind) + 1) % KINDS.length); },
};

// ---------- Écran ----------
/** Règle des Défis sur la carte (bouton « i » de l'onglet Jeux), selon le grade. */
export function flybyRules() {
  const lvl = myLevel(), next = FLY_LEVELS[lvl.grade];
  return [
    "Trois défis qui alternent avec les avions autour de toi : lequel va passer près de toi, où un avion va atterrir, lequel vole le plus haut.",
    `Jusqu'à ${lvl.n} avions sur la carte. Premier essai : ${lvl.xp} XP, deuxième : la moitié. Destination : jusqu'à ${lvl.xp} XP, de moins en moins en s'éloignant de l'aéroport.`,
    `Destination : tout le gain à moins de 25 km de l'aéroport, 90 % à 50 km, 80 % à 100 km, 70 % à 150 km, 50 % à 250 km, 30 % à 400 km, 10 % à 600 km, rien au-delà ni hors du cône. La série continue à moins de ${DEST_OK_KM} km.`,
    "3 bonnes réponses d'affilée = gains ×2, 6 = ×3… jusqu'à ×5. Une erreur remet la série à zéro.",
    `Vérifié en vrai : si l'avion trouvé passe près de toi, photographie-le pendant son passage pour +${HUNT_XP} XP.`,
    next ? `Au grade ${next.grade} : ${next.n} avions, moins d'aides, ${next.xp} XP.` : "",
  ].filter(Boolean);
}

export function flybyGame(view) {
  let alive = true, map = null, game = null;
  const locBox = h("div", { style: { marginTop: "6px" } });
  const statsBox = h("div.fly-stats");
  const findBtn = h("button.btn.primary.block", { onclick: () => start() }, "Commencer");
  const status = h("div.small.dim.mt");
  const box = h("div");
  view.append(locBox, statsBox, findBtn, status, box);
  const showLoc = () => locBox.replaceChildren(Radar.location ? locationBadge(Radar.location) : "");
  const unsub = Radar.subscribe(showLoc);
  showLoc();

  /** Grade, série, multiplicateur, record ; ce que change le grade suivant. */
  function renderStats() {
    const lvl = myLevel(), st = Stats.get(), m = multiplier(st.streak);
    const cell = (k, v, cls = "") => h("div.fly-stat" + cls, h("span.k", k), h("span.v", v));
    statsBox.replaceChildren(
      cell("Grade", String(lvl.grade)), cell("Série", String(st.streak)),
      cell("Gain", `${lvl.xp} XP${m > 1 ? ` ×${m}` : ""}`, m > 1 ? ".hot" : ""), cell("Record", String(st.best)));
  }
  renderStats();
  window.addEventListener("planego-synced", renderStats);

  /** Bilan commun : série, multiplicateur, XP (une fois par avion et par jour). */
  function settle(ok, base, tag) {
    const st = Stats.get(), mult = ok ? multiplier(st.streak) : 1, already = QuizStore.hasAward(tag);
    const xp = Math.round(base * mult);
    if (ok) { st.streak++; st.best = Math.max(st.best, st.streak); } else st.streak = 0;
    Sound.answer(ok);
    Stats.set(st);
    if (xp && !already) { award(xp, tag); renderHud(); sync().catch(() => {}); toast(`+${xp} XP`); }
    const streakTxt = ok ? `Série : ${st.streak}${multiplier(st.streak) > mult ? ` — gains ×${multiplier(st.streak)} à la prochaine !` : ""}`
      : "Série remise à zéro";
    const xpTxt = !xp ? "Pas d'XP cette fois" : already ? "Déjà joué aujourd'hui pour cet avion : pas d'XP en plus" : `+${xp} XP${mult > 1 ? ` (×${mult})` : ""}`;
    renderStats();
    return { xp, xpTxt, streakTxt, ok };
  }

  async function start() {
    findBtn.disabled = true; findBtn.textContent = "Recherche…";
    box.replaceChildren(); map?.stop(); map = null; game = null;
    const lvl = myLevel(), lists = new Map();
    try {
      const loc = Radar.location || (await Radar.locate());
      if (!loc) throw new Error("position inconnue");
      const around = (r) => {
        if (!lists.has(r)) { status.textContent = `Recherche des avions à moins de ${r} km…`; lists.set(r, Adsb.around(loc.lat, loc.lon, r).catch(() => [])); }
        return lists.get(r);
      };
      const mapP = loadMap();
      let found = null;
      for (const kind of Turn.order()) {
        if (kind === "dest") {
          status.textContent = "Recherche d'un vol au trajet connu…";
          const q = (await buildDestination(await around(120))) || (await buildDestination(await around(250)));
          if (q) found = { ...q, kind };
        } else {
          const build = kind === "pass" ? (l) => buildQuestion(loc, l, lvl) : (l) => buildAltitude(l, lvl);
          let best = null;
          for (const r of [120, 250]) {
            const q = build(await around(r));
            if (q && (!best || q.planes.length > best.planes.length)) best = q;
            if (best?.planes.length >= lvl.n) break;
          }
          if (best) found = { ...best, kind };
        }
        if (!alive) return;
        if (found) break;
      }
      // Altitude : trajet de chaque avion (départ → arrivée, adsbdb) pour deviner s'il monte, croise ou descend
      if (found?.kind === "alt") { status.textContent = "Recherche des trajets…"; await addRoutes(found.planes); }
      const M = await mapP;
      if (!alive) return;
      if (!found) { status.textContent = "Pas assez d'avions autour de toi en ce moment. Réessaie dans quelques minutes."; return; }
      status.textContent = "";
      Turn.played(found.kind);
      playedThisSession.add((found.target?.ac || found.ac).hex);
      game = { ...found, loc, lvl, tries: 0, wrong: new Set(), sel: null, done: false };
      if (found.kind === "dest") showDestination(M); else showPick(M);
    } catch (e) {
      status.textContent = "Recherche impossible : " + (e.message || "erreur réseau");
    } finally {
      findBtn.disabled = false; findBtn.textContent = game ? "Autre défi" : "Commencer";
    }
  }

  const questionCard = (kicker, statement, hint) => h("div.card.pad.fly-question",
    h("div.kicker", kicker), h("div.fly-statement", ...statement), hint ? h("div.small.dim", hint) : null);
  const nextButtons = (extra) => h("div.row.mt", { style: { gap: "8px" } }, extra, h("button.btn.primary.block", { onclick: () => start() }, "Défi suivant"));

  // ----- Passage et Altitude : toucher le bon avion -----
  function showPick(M) {
    const { target, planes, loc, lvl, kind } = game;
    const isPass = kind === "pass";
    const km = isPass ? kmText(target.a.closest) : "", min = isPass ? minText(target.a.tClosest) : "";
    const time = new Date(game.at).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
    const rows = h("div.fly-rows");
    const validate = h("button.btn.primary.block.mt", { disabled: true, onclick: () => answer() }, "Touche un avion");
    const feedback = h("div.mt");
    const altOf = (p) => `${Math.round((p.ac.altitudeFt ?? 0) * 0.3048).toLocaleString(LOCALE)} m`;

    const marks = () => {
      const out = isPass && (lvl.ring || game.done) ? [{ type: "line", points: ring(loc.lat, loc.lon, Number(km)), cls: "ring" }] : [];
      if (!isPass) {
        // Trajet complet de chaque avion (départ → arrivée) : celui choisi en ambre, les autres en gris
        for (const p of planes) if (p.route) {
          const o = p.route.origin, d = p.route.destination, on = game.sel === p || (game.done && p === target);
          out.push({ type: "line", points: arc(o.lat, o.lon, d.lat, d.lon), cls: "route" + (on ? " on" : "") });
          if (on) out.push({ type: "dot", lon: o.lon, lat: o.lat, r: 4, cls: "origin" }, { type: "dot", lon: d.lon, lat: d.lat, r: 4, cls: "origin" });
        }
      }
      if (isPass && game.done) {
        for (const p of planes) {
          const t = p.a.kind === "AWAY" || p.a.kind === "LANDS" ? 10 * 60 : p.a.tClosest;
          const [lon, lat] = ahead(p.ac, t);
          out.push({ type: "line", points: [[p.ac.lon, p.ac.lat], [lon, lat]], cls: p === target ? "ahead" : "flown" });
          if (p === target) out.push({ type: "dot", lon, lat, r: 5, cls: "dest" });
        }
      }
      out.push({ type: "dot", lon: loc.lon, lat: loc.lat, r: 6, cls: "me" });
      planes.forEach((p, i) => {
        const cls = game.done && p === target ? "ok" : game.wrong.has(p) ? "bad" : game.sel === p ? "sel" : "";
        const label = !isPass && game.done ? `${LETTERS[i]} ${altOf(p)}` : LETTERS[i];
        out.push({ type: "plane", lon: p.ac.lon, lat: p.ac.lat, deg: p.ac.trackDeg, cls, label, size: 1.15 });
      });
      return out;
    };
    const select = (p) => {
      if (game.done || game.wrong.has(p)) return;
      game.sel = p;
      validate.disabled = false;
      validate.textContent = `Valider : l'avion ${LETTERS[planes.indexOf(p)]}`;
      redraw();
    };
    map = worldMap(M, {
      label: isPass ? "Carte des avions autour de toi : touche celui qui va passer près de toi" : "Carte des avions autour de toi : touche celui qui vole le plus haut",
      onTap: (lon, lat, at) => {
        let best = null, bestPx = 34;
        for (const p of planes) { const d = at.px(p.ac.lon, p.ac.lat); if (d < bestPx) { best = p; bestPx = d; } }
        if (best) select(best);
      },
    });
    function redraw() {
      map.setMarks(marks());
      rows.replaceChildren(...planes.map((p, i) => {
        const ac = p.ac, all = game.done;
        const state = game.done && p === target ? ".ok" : game.wrong.has(p) ? ".bad" : game.sel === p ? ".sel" : "";
        const sub = isPass
          ? [acLabel(ac), `${Math.round(ac.altitudeFt ?? 0).toLocaleString(LOCALE)} ft`, (lvl.speed || all) && fmtSpeed(ac),
            (lvl.cap || all) && `cap ${Math.round(ac.trackDeg)}° ${cardinal(ac.trackDeg)}`]
          : [acLabel(ac), fmtSpeed(ac)];
        const routeTxt = isPass ? null : p.route ? routeLabel(p) : "Trajet inconnu";
        const fateTxt = !all ? null : isPass ? fate(p.a) : `${fmtAltitude(ac)}${p === target ? " : le plus haut" : ""}`;
        return h("button.fly-row" + state, { type: "button", onclick: () => select(p), disabled: game.done || game.wrong.has(p) },
          h("span.fly-letter", LETTERS[i]),
          h("span.fly-main",
            h("span.fly-model", prettyModel(ac.description) || ac.type || "Avion"),
            h("span.fly-sub", sub.filter(Boolean).join(" · ")),
            routeTxt ? h("span.fly-route", routeTxt) : null,
            fateTxt ? h("span.fly-fate", fateTxt) : null));
      }));
    }
    function answer() {
      const p = game.sel;
      if (!p || game.done) return;
      game.tries++;
      if (p === target) return finish(true);
      game.wrong.add(p); game.sel = null;
      if (game.tries >= 2) return finish(false);
      Sound.miss();
      validate.disabled = true; validate.textContent = "Touche un autre avion";
      feedback.replaceChildren(h("div.small", `Raté : ce n'est pas l'avion ${LETTERS[planes.indexOf(p)]}. Encore un essai, pour la moitié des XP.`));
      redraw();
    }
    function finish(ok) {
      game.done = true;
      const r = settle(ok, ok ? (game.tries === 1 ? lvl.xp : lvl.xp / 2) : 0, isPass ? tagOf(target.ac) : altTag(target.ac));
      validate.remove();
      // Bonus « Vérifié en vrai » (Passage) : l'avion passe assez près pour être vu et photographié
      let hunt = null;
      if (isPass && ok && huntable(target.a)) {
        hunt = { hex: target.ac.hex, from: game.at, until: game.at + (target.a.tClosest + 15 * 60) * 1000, tag: `chasse:${target.ac.hex}:${dayTag()}` };
        if (QuizStore.hasAward(hunt.tag)) hunt = null; else Hunts.add(hunt);
      }
      const open = () => { Radar.pin(target.ac); location.hash = "#ac/" + target.ac.hex; };
      const model = prettyModel(target.ac.description) || target.ac.type || acLabel(target.ac);
      feedback.replaceChildren(h("div.card.pad.fly-result",
        h("div.kicker", ok ? "Bonne réponse" : "Réponse"),
        h("div.dest-model", `C'était l'avion ${LETTERS[planes.indexOf(target)]} : ${model}`),
        !isPass ? h("div.small", `Il vole à ${fmtAltitude(target.ac)}.`) : null,
        h("div.dest-xp" + (r.xp ? "" : ".dim"), r.xpTxt),
        h("div.small" + (ok ? "" : ".dim"), r.streakTxt),
        hunt ? h("div.fly-hunt",
          h("div.kicker", "Vérifié en vrai"),
          h("div", `Il va passer à ${kmText(target.a.closest)} km de toi vers ${new Date(game.at + target.a.tClosest * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}. `
            + `Photographie-le pendant son passage : +${HUNT_XP} XP en plus de la capture.`),
          h("button.btn.primary.block.mt", { onclick: open }, "Ouvrir sa fiche pour le photographier")) : null,
        h("div.small.dim.mt", isPass ? "Le trait vert montre où il va passer. Sous la liste, ce que fait chaque avion." : "Sous la liste, l'altitude de chaque avion."),
        nextButtons(hunt ? null : h("button.btn.block", { onclick: open }, "Voir cet avion"))));
      redraw();
    }

    // Altitude : voir les trajets en entier (départs et arrivées), puis revenir aux avions
    let wide = false;
    const withRoutes = planes.filter((p) => p.route);
    const routesBtn = isPass || !withRoutes.length ? null : h("button.btn.block.mt", { type: "button", onclick: () => {
      wide = !wide;
      if (wide) {
        const sel = game.sel?.route ? [game.sel] : withRoutes;
        map.fit([[loc.lon, loc.lat], ...planes.map((p) => [p.ac.lon, p.ac.lat]),
          ...sel.flatMap((p) => [[p.route.origin.lon, p.route.origin.lat], [p.route.destination.lon, p.route.destination.lat]])], 40);
      } else fitPlanes();
      routesBtn.textContent = wide ? "Revenir aux avions" : "Voir les trajets en entier";
    } }, "Voir les trajets en entier");
    box.replaceChildren(
      isPass
        ? questionCard(`Passage · positions à ${time} · ${planes.length} avions`,
          ["Un de ces avions va passer à ", h("b", `${km} km`), " de toi dans ", h("b", `${min} min`), "."],
          lvl.ring ? `Le cercle pointillé fait ${km} km autour de toi.` : null)
        : questionCard(`Altitude · positions à ${time} · ${planes.length} avions`,
          ["Lequel de ces avions vole ", h("b", "le plus haut"), " ?"],
          "Modèle, vitesse et trajet de chacun (sur la carte, en ambre pour l'avion choisi) : un avion loin de son départ et de son arrivée est sans doute en croisière, tout en haut ; près d'un aéroport, il monte ou descend."),
      h("div.fly-layout", h("div.fly-mapcol", map.el, routesBtn), h("div.fly-side", rows, validate, feedback)));
    redraw();
    const fitPlanes = () => map.fit([[loc.lon, loc.lat], ...planes.map((p) => [p.ac.lon, p.ac.lat])], 40);
    requestAnimationFrame(fitPlanes);
  }

  // ----- Destination : toucher la carte là où l'avion va atterrir -----
  function showDestination(M) {
    const { ac, route, lvl } = game;
    const o = route.origin, d = route.destination;
    const leftKm = distanceKm(ac.lat, ac.lon, d.lat, d.lon);
    const leftMin = (leftKm / (ac.speedKt * 1.852)) * 60 + 10; // + descente et approche
    let guess = null;
    const photo = h("img.dest-photo", { alt: "", referrerPolicy: "no-referrer", style: { display: "none" } });
    const model = h("div.dest-model", prettyModel(ac.description) || ac.type || "Avion");
    const company = h("div.small.dim", route.airline || ac.operator || "");
    const card = h("div.card.pad.dest-card", photo, h("div.dest-cs", acLabel(ac)), model, company,
      h("div.dest-facts",
        fact("Vient de", airport(o)),
        fact("Cap", `${Math.round(ac.trackDeg)}° (${cardinal(ac.trackDeg)})`),
        fact("Vitesse", fmtSpeed(ac)),
        fact("Altitude", fmtAltitude(ac).split(" (")[0]),
        fact("Vol restant", `≈ ${hm(leftMin)}`)));
    AdsbDb.extra(ac).then((x) => {
      const info = x?.info;
      if (!company.textContent && info?.owner) company.textContent = info.owner;
      // Photo de l'appareil (avec la livrée de la compagnie), sinon celle du modèle
      if (info?.photoUrl) { photo.src = info.photoUrl; photo.style.display = ""; }
      else Wiki.find(wikiQuery.ac(ac)).then((w) => { if (w?.thumbnailUrl) { photo.src = w.imageUrl || w.thumbnailUrl; photo.style.display = ""; } }).catch(() => {});
    }).catch(() => {});

    // Aide : cône dans la direction de l'avion (assez large pour contenir l'arrivée, sans être centré dessus)
    const off = Math.abs(((bearingDeg(ac.lat, ac.lon, d.lat, d.lon) - ac.trackDeg + 540) % 360) - 180);
    const half = Math.max(20, Math.ceil((off + 8) / 10) * 10);
    const help = cone(ac.lat, ac.lon, ac.trackDeg, half, leftKm * 1.35, leftKm);
    const base = [{ type: "area", points: help.area, cls: "cone" },
      { type: "line", points: arc(o.lat, o.lon, ac.lat, ac.lon), cls: "flown" }, { type: "dot", lon: o.lon, lat: o.lat, r: 4, cls: "origin" },
      { type: "plane", lon: ac.lon, lat: ac.lat, deg: ac.trackDeg, cls: "sel" }];
    const validate = h("button.btn.primary.block.mt", { disabled: true, onclick: () => reveal() }, "Touche la carte pour répondre");
    const feedback = h("div.mt");
    map = worldMap(M, {
      label: "Carte du monde : touche l'endroit où l'avion va atterrir",
      onTap: (lon, lat) => {
        if (game.done) return;
        guess = { lon, lat };
        map.setMarks([...base, { type: "dot", lon, lat, r: 7, cls: "guess" }]);
        validate.disabled = false; validate.textContent = "Valider : il atterrit ici";
      },
    });
    function reveal() {
      if (!guess || game.done) return;
      game.done = true;
      const err = distanceKm(guess.lat, guess.lon, d.lat, d.lon);
      // Réponse en dehors du cône : rien (on connaît la direction de l'avion)
      const gb = bearingDeg(ac.lat, ac.lon, guess.lat, guess.lon), gd = distanceKm(ac.lat, ac.lon, guess.lat, guess.lon);
      const inCone = Math.abs(((gb - ac.trackDeg + 540) % 360) - 180) <= half && gd <= leftKm * 1.35;
      const base10 = inCone ? destXp(err) : 0, ok = inCone && err <= DEST_OK_KM;
      const r = settle(ok, base10 ? Math.max(1, Math.round((base10 * lvl.xp) / 10)) : 0, destTag(ac));
      map.setMarks([...base,
        { type: "line", points: arc(ac.lat, ac.lon, d.lat, d.lon), cls: "ahead" },
        { type: "line", points: [[guess.lon, guess.lat], [d.lon, d.lat]], cls: "miss" },
        { type: "dot", lon: guess.lon, lat: guess.lat, r: 7, cls: "guess" },
        { type: "dot", lon: d.lon, lat: d.lat, r: 7, cls: "dest" }]);
      map.fit([[guess.lon, guess.lat], [d.lon, d.lat], [ac.lon, ac.lat]], 300);
      const km = err < 10 ? err.toFixed(1).replace(".", ",") : Math.round(err).toLocaleString(LOCALE);
      validate.remove();
      feedback.replaceChildren(h("div.card.pad.fly-result",
        h("div.kicker", ok ? "Bien vu" : "Réponse"),
        h("div.dest-model", airport(d)),
        d.name && d.name !== d.city ? h("div.small.dim", d.name) : null,
        h("div.dest-score", h("span.big", `${km} km`), h("span.small.dim", "entre ta réponse et l'aéroport")),
        h("div.dest-xp" + (r.xp ? "" : ".dim"), r.xpTxt),
        !inCone ? h("div.small", "Ta réponse était en dehors du cône : l'avion ne va pas dans cette direction.") : null,
        h("div.small" + (ok ? "" : ".dim"), ok ? r.streakTxt : `${r.streakTxt} : il faut viser à moins de ${DEST_OK_KM} km.`),
        nextButtons(null)));
    }
    box.replaceChildren(
      questionCard(`Destination · ${acLabel(ac)}`, ["Où va ", h("b", "atterrir"), " cet avion ?"],
        "Le cône montre la direction de l'avion : l'aéroport est dedans. Aide-toi du vol restant et de la vitesse pour estimer la distance. Glisse, pince ou + / − pour zoomer, touche pour répondre."),
      h("div.fly-layout", h("div.fly-mapcol", map.el), h("div.fly-side", card, validate, feedback)));
    map.setMarks(base);
    // Cadrage : départ, avion et la distance qu'il peut encore parcourir (sans montrer l'arrivée)
    requestAnimationFrame(() => map.fit([[o.lon, o.lat], ...help.area]));
  }

  return () => { alive = false; unsub(); map?.stop(); window.removeEventListener("planego-synced", renderStats); };
}

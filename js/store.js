// Données gardées sur l'appareil : collection (photos dans IndexedDB), passages, quiz, réglages.
import { ls, uuid, weekStart } from "./util.js";
import { Supa } from "./supa.js";
import { Sound } from "./sound.js";
import { MAX_PHOTO_KM, rarityByName, prettyModel, levelOf, computeXp, modelKey, spottedRarity, describeXp } from "./game.js";

// ---------- Photos (IndexedDB) ----------
let dbp = null;
function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open("planego", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("photos", mode), st = t.objectStore("photos");
    const req = fn(st);
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}
const urlCache = new Map();
export const Photos = {
  put: (id, blob) => tx("readwrite", (s) => s.put(blob, id)),
  get: (id) => tx("readonly", (s) => s.get(id)),
  del: (id) => { urlCache.delete(id); return tx("readwrite", (s) => s.delete(id)); },
  /** URL affichable d'une photo locale (ou null). */
  async url(id) {
    if (!id) return null;
    if (urlCache.has(id)) return urlCache.get(id);
    const b = await Photos.get(id).catch(() => null);
    const u = b ? URL.createObjectURL(b) : null;
    if (u) urlCache.set(id, u);
    return u;
  },
};

// ---------- Collection ----------
const CKEY = "collection";
const uid = () => Supa.userId || "";
const all = () => ls.get(CKEY, []);
const saveAll = (l) => ls.set(CKEY, l);
const mine = () => { const u = uid(); return all().filter((e) => !e.ownerId || e.ownerId === u); };

/** Photo ancienne (ajoutée depuis le Catalogue) : sans vérification, 0 XP, pas d'avion précis, jamais au concours. */
export const isOld = (e) => e?.source === "old";
export const entryModel = (e) => prettyModel(e.model || e.type);
export const entryLabel = (e) => e.callsign || e.registration || (isOld(e) ? entryModel(e) || "Photo ancienne" : (e.hex || "").toUpperCase());
export const entryRarity = (e) => rarityByName(e.rarity);
export const entryPhoto = async (e) => (e.photoId ? await Photos.url(e.photoId) : null) || (e.remotePhoto ? Supa.publicUrl("photos", e.remotePhoto) : null);

// ---------- Album : plusieurs photos du même avion (XP inchangés), carrousel dans le feed ----------
export const ALBUM_MAX = 10; // photos par avion, la principale comprise (comme sur le serveur)
const PRINT_KEYS = ["checks", "phash", "pstrength", "shotAt", "fileHash"];
/** Les photos d'une capture : la principale (champs de la capture) puis celles de l'album, dans l'ordre. */
export function entryPhotoItems(e) {
  const main = { photoId: e.photoId || null, remotePhoto: e.remotePhoto || null };
  for (const k of PRINT_KEYS) main[k] = e[k] ?? null;
  return [main, ...(e.album || [])];
}
/** Adresses affichables de toutes les photos d'une capture. */
export async function entryPhotos(e) {
  const urls = await Promise.all(entryPhotoItems(e).map((it) => entryPhoto(it)));
  return urls.filter(Boolean);
}
/** Champs de la capture pour une liste de photos (la première devient la principale). */
function fromItems(items) {
  const [main, ...rest] = items, patch = { photoId: main.photoId || null, remotePhoto: main.remotePhoto || null, album: rest };
  for (const k of PRINT_KEYS) patch[k] = main[k] ?? null;
  return patch;
}
/** Ajoute une photo à l'album d'un avion déjà attrapé (vérifiée, sans XP). Envoyée à la prochaine synchronisation. */
export async function addAlbumPhoto(entry, blob, takenAt, verdict = null) {
  const e = Collection.get(entry.id) || entry, items = entryPhotoItems(e);
  if (items.length >= ALBUM_MAX) throw new Error(`Album complet (${ALBUM_MAX} photos) : retire une photo depuis sa fiche pour en ajouter une autre.`);
  const photoId = "p" + Date.now() + Math.random().toString(36).slice(2, 6);
  await Photos.put(photoId, blob);
  const it = { photoId, remotePhoto: null, takenAt, checks: verdict?.checks || null, phash: verdict?.print.phash || null,
    pstrength: verdict?.print.pstrength ?? null, shotAt: verdict?.print.shotAt ?? null, fileHash: verdict?.print.fileHash || null };
  const out = Collection.update(e.id, { album: [...(e.album || []), it], albumPending: true });
  if ((!verdict || verdict.ok) && !isOld(e)) Hunts.photo(e.hex, takenAt);
  return out;
}
/** Retire la photo n° index (0 = principale : la suivante prend sa place). Il en reste toujours au moins une. */
export async function removeEntryPhoto(entry, index) {
  const e = Collection.get(entry.id) || entry, items = entryPhotoItems(e);
  if (items.length < 2) throw new Error("C'est la seule photo de cet avion : supprime plutôt la capture.");
  const [gone] = items.splice(index, 1);
  if (gone?.photoId) await Photos.del(gone.photoId).catch(() => {});
  return Collection.update(e.id, { ...fromItems(items), albumPending: true });
}
/** La photo n° index devient la photo principale (celle du concours, des vignettes et la première du carrousel). */
export function setMainEntryPhoto(entry, index) {
  const e = Collection.get(entry.id) || entry, items = entryPhotoItems(e);
  const [it] = items.splice(index, 1);
  return Collection.update(e.id, { ...fromItems([it, ...items]), albumPending: true });
}
/** Après la synchronisation : photos telles qu'en ligne (chemins envoyés). */
export const albumSynced = (id, items) => Collection.update(id, { ...fromItems(items), albumPending: false });

export const Collection = {
  all: () => mine().sort((a, b) => b.takenAt - a.takenAt),
  totalXp: () => mine().reduce((s, e) => s + (e.xp || 0), 0),
  // Une photo non validée (sans XP) ou ancienne ne bloque pas les XP d'une vraie photo du même avion ou modèle
  countForHex: (hex) => mine().filter((e) => e.hex === hex && !e.rejected && !isOld(e)).length,
  hasModel: (key) => !!key && mine().some((e) => !e.rejected && !isOld(e) && modelKey(e) === key.toUpperCase()),
  /** Empreintes des photos déjà ajoutées (détection des doublons). */
  prints: () => mine().flatMap(entryPhotoItems).filter((e) => e.phash || e.fileHash).map((e) => ({ phash: e.phash, pstrength: e.pstrength, shotAt: e.shotAt, fileHash: e.fileHash })),
  hexes: () => new Set(mine().filter((e) => !e.rejected && !isOld(e)).map((e) => e.hex)),
  /** Mes photos d'un avion précis (même code ICAO 24 bits) : les validées d'abord, la plus récente en tête. */
  forHex: (hex) => mine().filter((e) => e.hex === hex).sort((a, b) => (a.rejected ? 1 : 0) - (b.rejected ? 1 : 0) || b.takenAt - a.takenAt),
  /** La capture qui compte pour cet avion (photo validée), ou null : un avion ne s'attrape qu'une fois. */
  caughtFor: (hex) => mine().filter((e) => e.hex === hex && !e.rejected && !isOld(e)).sort((a, b) => b.xp - a.xp || a.id - b.id)[0] || null,
  get: (id) => all().find((e) => e.id === id),
  add(e) { const l = all(); l.push(e); saveAll(l); },
  update(id, patch) { const l = all(), e = l.find((x) => x.id === id); if (e) { Object.assign(e, patch); saveAll(l); } return e || null; },
  /** Captures déjà en ligne dont la photo a été remplacée sur le téléphone et doit être renvoyée. */
  photoPending: (u) => all().filter((e) => e.ownerId === u && e.remoteId && e.photoPending && e.photoId),
  /** Captures en ligne dont l'album a changé sur le téléphone (photo ajoutée, retirée, nouvelle principale). */
  albumPending: (u) => all().filter((e) => e.ownerId === u && e.remoteId && e.albumPending),
  async remove(id) {
    const l = all(), e = l.find((x) => x.id === id);
    for (const it of e ? entryPhotoItems(e) : []) if (it.photoId) await Photos.del(it.photoId).catch(() => {});
    saveAll(l.filter((x) => x.id !== id));
  },
  claimOrphans(u) { const l = all(); let ch = false; l.forEach((e) => { if (!e.ownerId) { e.ownerId = u; ch = true; } }); if (ch) saveAll(l); },
  pending: (u) => all().filter((e) => e.ownerId === u && !e.remoteId && e.photoId),
  markSynced(id, remote) { const l = all(); const e = l.find((x) => x.id === id); if (e) { e.remoteId = remote.id; e.remotePhoto = remote.photo_path; saveAll(l); } },
  mergeRemote(u, remote) {
    let l = all();
    const known = new Set(l.map((e) => e.remoteId).filter(Boolean)), ids = new Set(remote.map((r) => r.id));
    l = l.filter((e) => !(e.ownerId === u && e.remoteId && !ids.has(e.remoteId)));
    for (const r of remote) {
      if (known.has(r.id)) {
        // Album modifié depuis un autre appareil : on suit la version du serveur (en gardant les photos HD du téléphone)
        const e = l.find((x) => x.remoteId === r.id);
        if (e && !e.photoPending && !e.albumPending) {
          const paths = [r.photo_path, ...(r.photos || [])], local = entryPhotoItems(e);
          const now = paths.map((p) => local.find((it) => it.remotePhoto === p) || { photoId: null, remotePhoto: p });
          if (now.map((it) => it.remotePhoto).join() !== local.map((it) => it.remotePhoto).join()) Object.assign(e, fromItems(now));
        }
        continue;
      }
      l.push({
        id: Date.parse(r.created_at) || Date.now(), hex: r.hex, callsign: r.callsign || "", registration: r.registration || "",
        type: r.type || "", model: r.model || "", operator: r.operator || "", countryIso: r.country_iso || "", countryName: r.country_name || "",
        military: !!r.military, rarity: r.rarity, xp: r.xp, newModel: !!r.new_model, photoId: null, takenAt: Date.parse(r.taken_at) || 0,
        distanceKm: r.distance_km, route: r.route || "", flightKm: r.flight_km, source: r.source || "live", ownerId: u,
        remoteId: r.id, remotePhoto: r.photo_path, album: (r.photos || []).map((p) => ({ photoId: null, remotePhoto: p })),
      });
    }
    saveAll(l);
  },
};

/** Nouvelle capture (photo prise ou importée) : calcule les XP et l'enregistre. */
/** verdict : résultat de verifyPhoto ; une photo non validée est gardée, sans XP. */
export async function createCatch(s, blob, source, takenAt, verdict = null) {
  let xp = computeXp(s, { hasModel: Collection.hasModel, countForHex: Collection.countForHex });
  const rejected = !!verdict && !verdict.ok;
  if (rejected) xp = { ...xp, total: 0, newModelBonus: 0, zeroReason: `Photo non validée (${verdict.reason.toLowerCase()})` };
  const before = levelOf(Player.xp());
  const id = Date.now(), photoId = "p" + id;
  await Photos.put(photoId, blob);
  const entry = {
    id, hex: s.hex, callsign: s.callsign, registration: s.registration, type: s.type, model: s.model, operator: s.operator,
    countryIso: s.countryIso, countryName: s.countryName, military: s.military, rarity: xp.rarity.key, xp: xp.total,
    newModel: xp.newModelBonus > 0, photoId, takenAt, distanceKm: s.distanceKm, route: s.route, flightKm: s.flightKm,
    source, ownerId: uid(), remoteId: null, remotePhoto: null,
    // Vérification automatique de la photo
    rejected, checks: verdict?.checks || null,
    phash: verdict?.print.phash || null, pstrength: verdict?.print.pstrength ?? null, shotAt: verdict?.print.shotAt ?? null,
    fileHash: verdict?.print.fileHash || null,
  };
  Collection.add(entry);
  if (!rejected) Hunts.photo(s.hex, takenAt);
  const total = Player.xp();
  return { entry, xp, levelBefore: before, levelAfter: levelOf(total), total };
}
/**
 * Photo(s) ancienne(s) d'un modèle du catalogue (c) : aucune vérification, 0 XP, pas d'avion précis (hex vide).
 * Plusieurs photos d'un coup = une seule publication (la première + l'album, 10 au plus). Envoyée à la prochaine synchronisation.
 */
export async function createOldPhoto(c, blobs, takenAt, registration = "") {
  const id = Date.now(), stamp = (i) => "p" + id + (i ? "_" + i : "");
  const list = blobs.slice(0, ALBUM_MAX);
  for (let i = 0; i < list.length; i++) await Photos.put(stamp(i), list[i]);
  const entry = {
    id, hex: "", callsign: "", registration: (registration || "").trim().toUpperCase(), type: c.codes[0], model: c.name,
    operator: "", countryIso: "", countryName: "", military: !!c.military, rarity: c.rarity.key, xp: 0, newModel: false,
    photoId: stamp(0), takenAt, distanceKm: null, route: "", flightKm: null, source: "old", ownerId: uid(), remoteId: null,
    remotePhoto: null, album: list.slice(1).map((_, i) => ({ photoId: stamp(i + 1), remotePhoto: null, takenAt })),
  };
  if (entry.album.length) entry.albumPending = true;
  Collection.add(entry);
  return entry;
}

export function catchMessage(o) {
  let m = o.xp.zeroReason
    ? `${o.xp.rarity.stars} ${o.xp.rarity.label}\n\n${o.xp.zeroReason} : la photo est ajoutée à votre collection, sans XP.`
    : `${describeXp(o.xp)}\n\n= +${o.xp.total} XP`;
  m += `\n\nTotal : ${o.total} XP — Niveau ${o.levelAfter.number} « ${o.levelAfter.name} »`;
  if (o.levelAfter.number > o.levelBefore.number) m += `\n\nNouveau grade : ${o.levelAfter.name} !`;
  if (Supa.isLoggedIn) m += "\n\nLa photo est publiée sur votre feed et sauvegardée sur votre compte.";
  return m;
}

// ---------- Passages (avions vus à moins de 30 km) ----------
// Gardés une semaine : la liste repart à zéro le lundi à 0 h (heure de Paris), en même temps que le concours photo.
const SKEY = "sightings";
const thisWeek = (ms) => ms >= weekStart();
let lastSave = 0, sightCache = null;
/** Passages enregistrés ; ceux des semaines précédentes sont effacés au chargement. */
const sightMap = () => {
  if (!sightCache) {
    const all = ls.get(SKEY, {});
    sightCache = Object.fromEntries(Object.entries(all).filter(([, v]) => thisWeek(v.seenAt)));
    if (Object.keys(sightCache).length !== Object.keys(all).length) ls.set(SKEY, sightCache);
  }
  return sightCache;
};
export const Sightings = {
  record(list, extras, spottedFn) {
    const map = sightMap(), now = Date.now();
    let changed = false;
    for (const ac of list) {
      const d = ac.distanceKm;
      if (d == null || d > MAX_PHOTO_KM || ac.onGround) continue;
      const prev = map[ac.hex], recent = prev && thisWeek(prev.seenAt) && now - prev.seenAt < 3 * 3600e3;
      if (recent && (prev.spotted.distanceKm ?? 999) <= d && prev.spotted.model) continue;
      const s = spottedFn(ac, extras.get(ac.hex));
      const label = [ac.callsign || ac.registration || ac.hex.toUpperCase(), prettyModel(s.model || ac.type)].filter(Boolean).join(" · ");
      map[ac.hex] = { spotted: s, seenAt: recent ? prev.seenAt : now, label };
      changed = true;
    }
    for (const [k, v] of Object.entries(map)) if (!thisWeek(v.seenAt)) { delete map[k]; changed = true; } // nouvelle semaine : on repart à zéro
    if (changed && now - lastSave > 10000) { ls.set(SKEY, map); lastSave = now; }
  },
  flush: () => sightCache && ls.set(SKEY, sightCache),
  /** Avions vus par l'appli Android en arrière-plan : [{ac, seenAt, lat, lon}]. */
  importNative(items, spottedFn) {
    const map = sightMap();
    for (const { ac, seenAt, lat, lon } of items) {
      if (!ac?.hex || ac.distanceKm == null || ac.distanceKm > MAX_PHOTO_KM || !thisWeek(seenAt)) continue;
      const prev = map[ac.hex] && thisWeek(map[ac.hex].seenAt) ? map[ac.hex] : null;
      if (prev && Math.abs(prev.seenAt - seenAt) < 3 * 3600e3 && (prev.spotted.distanceKm ?? 999) <= ac.distanceKm) continue;
      const s = spottedFn(ac, lat, lon);
      const label = [ac.callsign || ac.registration || ac.hex.toUpperCase(), prettyModel(s.model || ac.type)].filter(Boolean).join(" · ");
      map[ac.hex] = { spotted: s, seenAt: prev && Math.abs(prev.seenAt - seenAt) < 3 * 3600e3 ? Math.min(prev.seenAt, seenAt) : seenAt, label };
    }
    for (const [k, v] of Object.entries(map)) if (!thisWeek(v.seenAt)) delete map[k];
    ls.set(SKEY, map); lastSave = Date.now();
  },
  /** Avions passés cette semaine, les plus récents d'abord (une photo peut leur être ajoutée jusqu'à dimanche minuit). */
  history: () => Object.values(sightMap()).filter((s) => thisWeek(s.seenAt)).sort((a, b) => b.seenAt - a.seenAt),
  recent: () => Sightings.history(),
  byHex: (hex) => { const s = sightMap()[hex]; return s && thisWeek(s.seenAt) ? s : null; },
};

// ---------- Quiz ----------
const QKEY = "quiz";
const q = () => ls.get(QKEY, { seen: {}, stats: {}, awards: [], current: null });
const qsave = (v) => ls.set(QKEY, v);
export const QuizStore = {
  totalXp: () => { const u = uid(); return q().awards.filter((a) => !a.ownerId || a.ownerId === u).reduce((s, a) => s + a.points, 0); },
  stats: () => q().stats[uid()] || { streak: 0, best: 0, answered: 0, correct: 0 },
  isSeen: (hex) => hex in q().seen,
  current: () => q().current,
  ask(question) { const v = q(); v.current = question; v.seen[question.hex] = Date.now(); qsave(v); },
  answer(choice, multiplierOf, baseXp) {
    const v = q(), cur = v.current;
    if (!cur) return null;
    const s = v.stats[uid()] || { streak: 0, best: 0, answered: 0, correct: 0 };
    const ok = choice === cur.answer, streak = ok ? s.streak + 1 : 0, mult = ok ? multiplierOf(streak) : 0;
    const points = ok ? baseXp * mult : 0;
    const ns = { streak, best: Math.max(s.best, streak), answered: s.answered + 1, correct: s.correct + (ok ? 1 : 0) };
    v.stats[uid()] = ns;
    if (points > 0) v.awards.push({ id: uuid(), points, hex: cur.hex, at: Date.now(), ownerId: uid(), synced: false });
    v.current = null;
    qsave(v);
    return { correct: ok, points, multiplier: mult, stats: ns };
  },
  /** XP gagnés hors question en direct (quiz du jour…) ; tag = identifiant libre enregistré dans « hex ». */
  /** Gain déjà enregistré pour cette étiquette ? (ex. une seule partie « Destination » par vol et par jour) */
  hasAward: (tag) => q().awards.some((a) => a.hex === tag && (!a.ownerId || a.ownerId === uid())),
  addAward(points, tag) { Sound.xp(points); const v = q(); v.awards.push({ id: uuid(), points, hex: tag, at: Date.now(), ownerId: uid(), synced: false }); qsave(v); },
  async sync(u) {
    let v = q();
    v.awards.forEach((a) => { if (!a.ownerId) a.ownerId = u; });
    qsave(v);
    for (const a of v.awards.filter((x) => x.ownerId === u && !x.synced)) {
      await Supa.rpc("add_quiz_award", { p_id: a.id, p_points: a.points, p_hex: a.hex, p_answered_at: new Date(a.at).toISOString() });
      v = q(); const x = v.awards.find((y) => y.id === a.id); if (x) x.synced = true; qsave(v);
    }
    const remote = await Supa.select(`quiz_awards?select=id,points,hex,answered_at&user_id=eq.${u}&limit=100000`);
    v = q();
    const known = new Set(v.awards.map((a) => a.id));
    for (const r of remote) if (!known.has(r.id)) v.awards.push({ id: r.id, points: r.points, hex: r.hex || "", at: Date.parse(r.answered_at) || 0, ownerId: u, synced: true });
    qsave(v);
  },
};

// ---------- Joueur ----------
export const Player = {
  xp: () => Collection.totalXp() + QuizStore.totalXp(),
  profile: null, // profil en ligne (pseudo, avatar, XP serveur)
  bestXp() { return Math.max(this.profile?.xp || 0, this.xp()); },
  level() { return levelOf(this.bestXp()); },
};

// ---------- Réglages ----------
export const Prefs = {
  RADIUS_STEPS: [500, 1000, 2000, 3000, 5000, 10000, 15000, 20000, 30000, 50000, 75000, 100000, 150000],
  VISIBLE_STEPS: [500, 1000, 2000, 3000, 5000, 7500, 10000],
  get radiusM() { return ls.get("radius_m", 20000); }, set radiusM(v) { ls.set("radius_m", v); },
  POLL_STEPS: [5000, 10000, 15000, 20000, 30000, 45000, 60000],
  /** Fréquence du scan du radar (temps entre deux recherches d'avions). */
  get pollMs() { return ls.get("poll_ms", 15000); }, set pollMs(v) { ls.set("poll_ms", v); },
  get visibleM() { return ls.get("visible_m", 3000); }, set visibleM(v) { ls.set("visible_m", v); },
  // Filtre de la liste du Scanner (types OU modèles, comme les notifications) ; null = tous les avions.
  // Ancien interrupteur « Afficher uniquement les militaires » repris tel quel.
  get listKinds() { return ls.get("list_kinds", ls.get("mil_only", false) ? ["MILITARY"] : null); }, set listKinds(v) { ls.set("list_kinds", v); },
  get listModels() { return ls.get("list_models", []); }, set listModels(v) { ls.set("list_models", v); },
  /** Liste et rose du Scanner : seulement les avions qui vont passer dans la zone visible (ou y sont déjà). */
  get listVisibleOnly() { return ls.get("list_visible_only", false); }, set listVisibleOnly(v) { ls.set("list_visible_only", v); },
  /** Notifier seulement les avions qui vont passer dans la zone visible à l'œil nu. */
  get notifyVisibleOnly() { return ls.get("notify_visible_only", false); }, set notifyVisibleOnly(v) { ls.set("notify_visible_only", v); },
  get notifyKinds() { return ls.get("notify_kinds", ["MILITARY"]); }, set notifyKinds(v) { ls.set("notify_kinds", v); },
  get notifyModels() { return ls.get("notify_models", []); }, set notifyModels(v) { ls.set("notify_models", v); },
};

export { spottedRarity };

// ---------- « Vérifié en vrai » (jeu « Qui passe ? », screens/flyby.js) ----------
// Après une bonne réponse sur un avion qui passe assez près, photographier cet avion avant la fin de son passage
// rapporte un bonus (une fois par avion et par jour). Bonus versé ici, à la capture, puis événement « planego-hunt ».
export const HUNT_XP = 30;
export const Hunts = {
  all: () => ls.get("flyby_hunts", []).filter((x) => x.until > Date.now()),
  add(hunt) { ls.set("flyby_hunts", [...Hunts.all().filter((x) => x.hex !== hunt.hex), hunt]); },
  get: (hex) => Hunts.all().find((x) => x.hex === hex) || null,
  photo(hex, takenAt) {
    const h = Hunts.get(hex), t = Number(new Date(takenAt));
    if (!h || !(t >= h.from && t <= h.until) || QuizStore.hasAward(h.tag)) return;
    QuizStore.addAward(HUNT_XP, h.tag);
    ls.set("flyby_hunts", Hunts.all().filter((x) => x.hex !== hex));
    window.dispatchEvent(new CustomEvent("planego-hunt", { detail: { hex, xp: HUNT_XP } }));
  },
};

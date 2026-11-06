// Radar : position GPS, avions autour toutes les 15 s, journal des passages, notifications.
import { LOCALE, LANG } from "./i18n.js";
import { Adsb, AdsbDb, Wiki } from "./net.js";
import { Sightings, Prefs } from "./store.js";
import { spottedFrom, filterMatches, approach, duration, lookLabel, UNCERTAIN_TEXT, acLabel, fmtDistance, fmtAltitude, fmtOrigin, prettyModel } from "./game.js";
import { ls } from "./util.js";
import { Native, nativeConfig, takeNativeSightings } from "./native.js";
import { noteUnknownTypes } from "./census.js";

const REARM_MS = 3600e3, GPS_WAIT_MS = 15000;

/**
 * Position de secours quand celle du téléphone est inaccessible (refusée, GPS éteint, navigateur sans GPS) :
 * le joueur l'indique à la main (ville ou code postal, fenêtre `askLocation` de ui.js), gardée sur le téléphone
 * (clé `manual_location`) pour les fois suivantes. `isDefault: true` = pas la position du téléphone ; `manual`, `place`.
 * Sans position choisie : pas de position du tout (aucune position inventée), le jeu la demande.
 */
const MANUAL_KEY = "manual_location";
const manualLoc = (why) => {
  const m = ls.get(MANUAL_KEY);
  return m && Number.isFinite(m.lat) && Number.isFinite(m.lon)
    ? { lat: m.lat, lon: m.lon, place: m.place || null, accuracy: null, time: Date.now(), isDefault: true, manual: true, why } : null;
};
/** Nom du lieu choisi, pour l'affichage. */
export const approxPlace = (loc) => loc?.place || "lieu inconnu";
/** « Position choisie : Lyon » */
export const approxLabel = (loc) => `Position choisie : ${approxPlace(loc)}`;
const phoneLoc = (p) => ({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, time: p.timestamp, isDefault: false });
const geoWhy = (e) => (e?.code === 1 ? "Localisation refusée" : "Position du téléphone introuvable (GPS désactivé ?)");
const listeners = new Set();
const notified = new Map();
let watchId = null, timer = null, wakeLock = null, gpsWait = null;

export const Radar = {
  running: false,
  location: null, // {lat, lon, accuracy, time, isDefault, manual?, place?, why?}
  noLocation: null, // raison quand aucune position n'est connue (ni téléphone, ni choisie) : le jeu la demande
  /** Position choisie à la main par le joueur (GPS indisponible) : gardée et utilisée tout de suite si le GPS ne répond pas. */
  setManual({ lat, lon, place }) {
    ls.set(MANUAL_KEY, { lat, lon, place, at: Date.now() });
    if (Radar.location && !Radar.location.isDefault) return; // le GPS marche : il reste prioritaire
    const why = Radar.location?.why || Radar.noLocation;
    Radar.location = manualLoc(why); Radar.noLocation = null;
    Radar.emit();
    if (Radar.running) poll();
  },
  manualPlace: () => ls.get(MANUAL_KEY)?.place || null,
  aircraft: [],
  extras: new Map(),
  lastUpdate: 0,
  error: null,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { listeners.forEach((fn) => fn(Radar)); },

  async start() {
    if (Radar.running) return;
    Radar.running = true; Radar.error = null;
    ls.set("radar_on", true);
    // Dans l'appli Android, le radar continue aussi écran éteint (service de l'appli)
    if (Native) { try { Native.startRadar(nativeConfig()); } catch { /* ancienne version */ } }
    Radar.emit();
    if ("geolocation" in navigator) {
      watchGps();
      gpsWait = setTimeout(() => fallback("Position du téléphone introuvable pour l'instant"), GPS_WAIT_MS);
    } else fallback("Ce navigateur ne donne pas accès à la position");
    schedule();
    if (!Native) { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* non disponible */ } }
  },
  stop() {
    Radar.running = false;
    ls.set("radar_on", false);
    if (Native) { try { Native.stopRadar(); } catch { /* ancienne version */ } }
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    clearInterval(timer); clearTimeout(gpsWait); watchId = null; timer = null; gpsWait = null;
    wakeLock?.release?.().catch(() => {}); wakeLock = null;
    Sightings.flush();
    Radar.aircraft = []; Radar.lastUpdate = 0;
    Radar.emit();
  },
  /** Nouvelle fréquence du scan : appliquée tout de suite si le radar tourne. */
  setPollMs(ms) {
    Prefs.pollMs = ms;
    if (Radar.running && timer) { schedule(); poll(); }
  },

  // ---------- Scan rapide (appli Android 1.14+) ----------
  // Une recherche par seconde pendant 10 min, faite par le téléphone lui-même (adsb.fi en direct, avec sa propre
  // adresse internet) ; le site lit ses résultats au lieu de passer par le relais Supabase partagé. Puis retour
  // tout seul à la fréquence choisie.
  FAST_MIN: 10,
  canFast: () => typeof Native?.fastScan === "function",
  /** Heure de fin du scan rapide, 0 s'il n'est pas en cours. */
  fastUntil() { try { return Radar.canFast() ? Number(Native.fastScanUntil()) || 0 : 0; } catch { return 0; } },
  async startFast() {
    if (!Radar.canFast()) return false;
    if (!Radar.running) await Radar.start();
    try { Native.fastScan(Radar.FAST_MIN); } catch { return false; }
    schedule(); Radar.emit();
    return true;
  },
  stopFast() {
    try { Native?.stopFastScan?.(); } catch { /* ancienne version */ }
    schedule(); Radar.emit();
  },
  /** Avions ouverts hors de la zone du radar (recherche « le plus proche » du Scanner) : leur fiche reste disponible. */
  pinned: new Map(),
  find: (hex) => Radar.aircraft.find((a) => a.hex === hex) || Radar.pinned.get(hex),
  pin(ac) { Radar.pinned.set(ac.hex, ac); },
  /** Met à jour un avion épinglé qui n'est pas dans la liste du radar (fiche ouverte) ; renvoie true s'il a été retrouvé. */
  async refreshPinned(hex) {
    const old = Radar.pinned.get(hex), me = Radar.location;
    if (!old || !me || Radar.aircraft.some((a) => a.hex === hex)) return false;
    const ac = await Adsb.track(old, me).catch(() => null);
    if (!ac) return false;
    Radar.pinned.set(hex, ac); Radar.emit();
    return true;
  },
  async extra(ac) {
    if (Radar.extras.has(ac.hex)) return Radar.extras.get(ac.hex);
    const x = await AdsbDb.extra(ac);
    Radar.extras.set(ac.hex, x);
    return x;
  },
  /** Position actuelle ou demandée une fois (quiz sans radar) ; sinon la position choisie à la main ; null si aucune. */
  async locate() {
    if (Radar.location && Date.now() - Radar.location.time < 120000) return Radar.location;
    const useApprox = async (why) => {
      if (!Radar.location || Radar.location.isDefault) await setApprox(why);
      return Radar.location;
    };
    if (!navigator.geolocation) return useApprox("Ce navigateur ne donne pas accès à la position");
    return new Promise((res) => navigator.geolocation.getCurrentPosition(
      (p) => { Radar.location = phoneLoc(p); Radar.noLocation = null; Radar.emit(); res(Radar.location); },
      (e) => useApprox(geoWhy(e)).then(res), { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 }));
  },
  /** Nouvel essai pour avoir la position du téléphone (bouton « Réessayer ») ; true si elle est trouvée. */
  retry() {
    if (!navigator.geolocation) return Promise.resolve(false);
    return new Promise((res) => navigator.geolocation.getCurrentPosition((p) => {
      const first = !Radar.location || Radar.location.isDefault;
      Radar.location = phoneLoc(p); Radar.error = null; Radar.noLocation = null;
      Radar.emit();
      if (Radar.running) { watchGps(); if (first) poll(); } // le suivi GPS avait pu s'arrêter (autorisation refusée)
      res(true);
    }, async (e) => {
      if (!Radar.location || Radar.location.isDefault) await setApprox(geoWhy(e));
      res(false);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }));
  },
};

/** Position choisie à la main (ou aucune : le jeu la demandera) à la place de celle du téléphone ; true si une position est connue. */
async function setApprox(why) {
  const loc = manualLoc(why);
  if (Radar.location && !Radar.location.isDefault) return true; // le GPS a répondu entre-temps
  Radar.location = loc;
  Radar.noLocation = loc ? null : why;
  Radar.emit();
  return !!loc;
}
/** Sans position du téléphone (refusée, introuvable, ou trop longue à venir) : position choisie à la main. */
async function fallback(why) {
  if (Radar.running && (!Radar.location || Radar.location.isDefault) && (await setApprox(why)) && Radar.running) poll();
}

/** Suivi de la position du téléphone tant que le radar tourne. */
function watchGps() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition((p) => {
    const first = !Radar.location || Radar.location.isDefault;
    Radar.location = phoneLoc(p);
    Radar.error = null; Radar.noLocation = null;
    if (first) { Radar.emit(); poll(); } else Radar.emit();
  }, (e) => fallback(geoWhy(e)), { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
}

// Le verrou d'écran saute quand l'onglet passe en arrière-plan : on le reprend au retour
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") syncNative();
  if (!Native && document.visibilityState === "visible" && Radar.running && !wakeLock) {
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* ignoré */ }
  }
  if (document.visibilityState === "hidden") Sightings.flush();
});

/** Recherche suivante : chaque seconde pendant le scan rapide, sinon la fréquence choisie dans le Scanner. */
let fastOn = false;
function schedule() {
  clearInterval(timer);
  fastOn = Radar.fastUntil() > Date.now();
  timer = setInterval(poll, fastOn ? 1000 : Prefs.pollMs);
}

/** Avions trouvés par le radar du téléphone (scan rapide) ; null s'il n'a encore rien trouvé. */
function nativeAircraft() {
  let o = null;
  try { o = JSON.parse(Native.latestAircraft() || "null"); } catch { return null; }
  if (!o?.at || !Array.isArray(o.ac) || Date.now() - o.at > 30000) return null;
  return { at: o.at, list: o.ac.map((a) => ({ ...a, fetchedAt: o.at })) };
}

let polling = false, lastNativeAt = 0;
async function poll() {
  const loc = Radar.location;
  if (!Radar.running || !loc || polling) return;
  // Fin du scan rapide : retour à la fréquence choisie
  if (fastOn && Radar.fastUntil() <= Date.now()) { schedule(); Radar.emit(); }
  polling = true;
  try {
    let list, at = Date.now();
    const n = fastOn ? nativeAircraft() : null;
    if (n) {
      if (n.at === lastNativeAt) return; // pas encore de nouvelle recherche du téléphone
      lastNativeAt = n.at; list = n.list; at = n.at;
    } else list = await Adsb.around(loc.lat, loc.lon, Prefs.radiusM / 1000);
    Radar.aircraft = list; Radar.lastUpdate = at; Radar.error = null;
    Radar.emit();
    noteUnknownTypes(list); // modèles inconnus du jeu, pour compléter le catalogue
    // Infos complémentaires des nouveaux avions (les plus proches d'abord)
    for (const ac of list.filter((a) => !Radar.extras.has(a.hex)).slice(0, 10)) await Radar.extra(ac);
    // Passages enregistrés avec la position du téléphone ou celle indiquée par le joueur
    Sightings.record(list, Radar.extras, (ac, x) => spottedFrom(ac, x, loc.lat, loc.lon));
    Radar.emit();
    notify(list);
  } catch (e) {
    Radar.error = navigator.onLine ? `Données ADS-B indisponibles (${e.message})` : "Pas de connexion internet";
    Radar.emit();
  } finally { polling = false; }
}

// ---------- Notifications (tant que l'appli est ouverte) ----------
/** L'avion fait-il partie des types ou modèles choisis pour les notifications ? */
export function shouldNotify(ac) {
  return filterMatches(ac, Prefs.notifyKinds, Prefs.notifyModels);
}

/** Approche de l'avion par rapport à la zone visible à l'œil nu (null sans position ou sans cap/vitesse). */
export function approachOf(ac, loc = Radar.location) {
  return loc ? approach(loc.lat, loc.lon, ac, Prefs.visibleM / 1000) : null;
}
/** Va-t-il être (ou est-il déjà) visible à l'œil nu ? */
export const willBeVisible = (a) => a?.kind === "NOW" || a?.kind === "SOON";

/** À notifier maintenant ? Type ou modèle choisi, et visible à l'œil nu si l'option est cochée. */
export function wantsNotification(ac, a) {
  return shouldNotify(ac) && (!Prefs.notifyVisibleOnly || willBeVisible(a));
}

/** Compte à rebours écrit dans la notification : « Visible dans 2 min 35 s (vers 08:52) » + où regarder. */
export function countdownText(a) {
  if (!a) return "";
  const at = (s) => new Date(Date.now() + s * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
  const look = lookLabel(a);
  const unsure = a.uncertain ? "\n" + UNCERTAIN_TEXT : "";
  switch (a.kind) {
    case "NOW": return "Visible maintenant, levez les yeux" + (look ? "\n" + look : "");
    case "SOON": return `Visible dans ${duration(a.toVisible)} (vers ${at(a.toVisible)})` + (look ? "\n" + look : "") + unsure;
    case "FAR": return `Au plus près dans ${duration(a.tClosest)}, à ${Math.round(a.closest)} km : trop loin pour être bien vu` + unsure;
    case "LANDS": return "En approche pour atterrir : il n'arrivera pas dans votre zone visible";
    default: return "";
  }
}

async function notify(list) {
  const now = Date.now();
  for (const [k, n] of notified) if (now - n.t > REARM_MS) notified.delete(k);
  if (Native) return; // l'appli Android envoie elle-même les notifications, même écran éteint
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const visibleOnly = Prefs.notifyVisibleOnly, visKm = Prefs.visibleM / 1000, here = new Set();
  for (const ac of list) {
    here.add(ac.hex);
    const a = approachOf(ac), prev = notified.get(ac.hex);
    if (prev) prev.missing = 0;
    // Mode « seulement visible à l'œil nu » : la notification disparaît dès que l'avion n'est plus visible
    if (prev && visibleOnly && (prev.kind === "NOW" || prev.kind === "SOON")) {
      const hovering = !a && !ac.onGround && (ac.distanceKm ?? 1e9) <= visKm; // hélicoptère sur place
      if (!hovering && !willBeVisible(a)) { prev.kind = "GONE"; closeNotification(ac.hex); continue; }
    }
    if (prev) {
      // Annoncé « visible dans… » : la notification passe à « Visible maintenant » sans resonner
      if (prev.kind === "SOON" && a?.kind === "NOW") { prev.kind = "NOW"; await showAircraftNotification(ac, a, { silent: true }); }
      continue;
    }
    if (!wantsNotification(ac, a)) continue;
    notified.set(ac.hex, { t: now, kind: a?.kind });
    await showAircraftNotification(ac, a);
  }
  // Avion sorti de la zone du radar (ou signal perdu deux recherches de suite) : notification retirée aussi
  if (visibleOnly) for (const [hex, n] of notified) {
    if (here.has(hex) || (n.kind !== "NOW" && n.kind !== "SOON")) continue;
    if ((n.missing = (n.missing || 0) + 1) >= 2) { n.kind = "GONE"; closeNotification(hex); }
  }
}

/** Ferme la notification d'un avion (elle porte son code ICAO comme étiquette). */
async function closeNotification(hex) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    (await reg?.getNotifications({ tag: hex }) || []).forEach((n) => n.close());
  } catch { /* notifications indisponibles */ }
}

export async function showAircraftNotification(ac, a = approachOf(ac), { silent = false } = {}) {
  const extra = await Radar.extra(ac).catch(() => null);
  const wiki = await Wiki.find({ type: ac.type, model: ac.description, military: ac.military }).catch(() => null);
  const name = (wiki && !wiki.searchOnly && wiki.title) || prettyModel(ac.description || ac.type) || "Type inconnu";
  const origin = fmtOrigin(ac, extra);
  const count = countdownText(a);
  const title = ac.military ? `Avion militaire : ${acLabel(ac)}` : `Avion : ${acLabel(ac)}`;
  const body = [count, `${name} — ${fmtDistance(ac)}, ${fmtAltitude(ac)}`, origin].filter(Boolean).join("\n");
  const opts = { body, tag: ac.hex, renotify: !silent, silent, icon: "icons/icon-192.png", badge: "icons/badge-96.png",
    image: extra?.info?.photoUrl || wiki?.imageUrl || undefined, data: { hex: ac.hex } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch { /* notifications bloquées */ }
}

/**
 * Appli Android : récupère les avions vus appli fermée, et suit l'état du radar
 * (il a pu être arrêté depuis la notification « radar actif »).
 */
function syncNative() {
  if (!Native) return;
  const items = takeNativeSightings();
  if (items.length) Sightings.importNative(items, (ac, lat, lon) => spottedFrom(ac, null, lat, lon));
  let on = Radar.running;
  try { on = Native.isRunning(); } catch { /* ancienne version */ }
  if (!on && Radar.running) { Radar.running = false; ls.set("radar_on", false); Radar.stop(); }
  else if (on && !Radar.running) Radar.start();
  else if (Radar.running && fastOn !== Radar.fastUntil() > Date.now()) { schedule(); Radar.emit(); }
}
window.addEventListener("planego-native-resume", syncNative);

const wanted = (() => { if (Native) { try { return Native.isRunning(); } catch { /* ancienne version */ } } return ls.get("radar_on", false); })();
if (wanted) setTimeout(() => Radar.start(), 300);
setTimeout(syncNative, 500);

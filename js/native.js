// Pont avec l'appli Android Plane GO (absent dans un navigateur) : radar d'arrière-plan,
// vraies notifications, avions vus appli fermée, partage natif.
import { D } from "./data.js";
import { MODELS } from "./game.js";
import { Prefs } from "./store.js";

/** Objet fourni par l'appli Android, ou null dans un navigateur. */
export const Native = typeof window !== "undefined" && window.PlaneGONative ? window.PlaneGONative : null;

/** Réglages utiles au radar de l'appli : rayon, filtre de notifications, listes d'avions. */
export function nativeConfig() {
  const chosen = Prefs.notifyModels;
  return JSON.stringify({
    radiusM: Prefs.radiusM,
    visibleM: Prefs.visibleM,
    pollS: Math.round(Prefs.pollMs / 1000),
    visibleOnly: Prefs.notifyVisibleOnly,
    kinds: Prefs.notifyKinds,
    models: MODELS.filter((m) => chosen.includes(m.label)).map((m) => ({ codes: m.codes, militaryOnly: m.militaryOnly })),
    sets: { helicopters: D.helicopters, business: D.business, widebody: D.widebody, light: D.light, airliners: D.airliners,
      legendary: D.legendary, epic: D.epic, rareCivil: D.rareCivil },
    militaryCallsign: D.militaryCallsign,
  });
}

/** Transmet les réglages à l'appli (sans effet dans un navigateur). */
export function pushConfig() {
  try { Native?.setConfig(nativeConfig()); } catch { /* ancienne version de l'appli */ }
}

/** Avions vus par le radar de l'appli pendant qu'elle était en arrière-plan. */
export function takeNativeSightings() {
  if (!Native) return [];
  try { return JSON.parse(Native.takeSightings() || "[]"); } catch { return []; }
}

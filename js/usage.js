// Compteur des appels du site aux services extérieurs (console Admin › Résumé, pour surveiller les limites).
// Chaque requête est classée d'après son adresse (Wikipédia, adsbdb…), comptée par jour (heure de Paris), puis les
// totaux partent en un seul petit envoi toutes les 10 minutes au plus et quand on quitte l'appli (RPC report_api_usage :
// des nombres seulement, ni identité ni position). Le relais ADS-B est compté par le serveur lui-même (fonction adsb) ;
// les demandes faites par l'appli Android (appli 1.27+, Native.adsbFetch) sont comptées par net.js (hit("telephone")).
// Pas comptés : les images (balises <img>) et la recherche du radar de l'appli Android écran éteint (service natif).
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { ls } from "./util.js";

const KEY = "api_usage_v1";
const RULES = [
  [/\/functions\/v1\/adsb\b/, null], // compté par le serveur
  [/\/rest\/v1\/rpc\/report_api_usage/, null], // l'envoi des compteurs lui-même
  [/\/functions\/v1\/ai-questions/, "ia"],
  [/\.supabase\.co\/functions\/v1\//, "fonctions"],
  [/\.supabase\.co\/storage\/v1\//, "stockage"],
  [/\.supabase\.co\/(rest|auth)\/v1\//, "base"],
  [/api\.adsbdb\.com/, "adsbdb"],
  [/wikipedia\.org/, "wikipedia"],
  [/wikidata\.org/, "wikidata"],
  [/commons\.wikimedia\.org/, "commons"],
  [/nominatim\.openstreetmap\.org/, "nominatim"],
  [/opendata\.adsb\.fi/, "adsb.fi"],
  [/adsb\.lol/, "adsb.lol"],
];

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
const today = () => dayFmt.format(new Date());

let store = (() => { try { const s = ls.get(KEY, null); return s && typeof s === "object" ? s : {}; } catch { return {}; } })();
let saveTimer = 0, sendTimer = 0, sending = false;

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = 0; try { ls.set(KEY, store); } catch { /* stockage plein : tant pis */ } }, 4000);
}

/** +n appels au service donné (aujourd'hui). */
export function hit(service, n = 1) {
  const d = today();
  const day = (store[d] ||= {});
  day[service] = (day[service] || 0) + n;
  save();
  if (!sendTimer) sendTimer = setTimeout(flush, 10 * 60e3);
}

function classify(url) {
  if (!/^https?:/i.test(url)) return null;
  for (const [re, svc] of RULES) if (re.test(url)) return svc;
  return null; // le site lui-même (pages, version…) et le reste : pas compté
}

/** Envoie les totaux d'aujourd'hui et d'hier (les plus anciens sont oubliés). */
export async function flush() {
  clearTimeout(sendTimer); sendTimer = 0;
  if (sending) return;
  const keep = new Set([today(), dayFmt.format(new Date(Date.now() - 86400e3))]);
  for (const d of Object.keys(store)) if (!keep.has(d)) delete store[d];
  const days = Object.keys(store).filter((d) => Object.values(store[d]).some((v) => v > 0));
  if (!days.length) return;
  sending = true;
  try {
    for (const d of days) {
      const sent = { ...store[d] };
      // Clé publique seulement : l'envoi ne dit pas qui joue
      const r = await realFetch(`${SUPABASE_URL}/rest/v1/rpc/report_api_usage`, {
        method: "POST", keepalive: true,
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_day: d, p_counts: sent }),
      });
      if (!r.ok) break;
      for (const [k, v] of Object.entries(sent)) { store[d][k] = Math.max(0, (store[d][k] || 0) - v); if (!store[d][k]) delete store[d][k]; }
      if (!Object.keys(store[d]).length) delete store[d];
    }
  } catch { /* hors ligne : on garde les compteurs */ }
  sending = false;
  try { ls.set(KEY, store); } catch { /* rien */ }
}

// Toutes les requêtes fetch du site passent par ici (une ligne de plus, rien d'autre ne change)
const realFetch = window.fetch.bind(window);
window.fetch = function (input, init) {
  try {
    const svc = classify(typeof input === "string" ? input : input?.url || String(input));
    if (svc) hit(svc);
  } catch { /* le compteur ne doit jamais gêner */ }
  return realFetch(input, init);
};

// Quand on quitte l'appli (ou passe à une autre) : envoi des totaux
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

// Recensement des codes d'avion inconnus du jeu (idée du propriétaire, novembre 2026).
// Quand le radar croise un avion dont le code de type n'est dans aucune liste de l'appli, on note ce code avec la
// description et la catégorie envoyées par l'avion, sans position ni identité du joueur. Envoi groupé au serveur
// (fonction report_unknown_types, table unknown_types) au plus toutes les 10 minutes, si le joueur est connecté.
// Le propriétaire consulte la liste pour ajouter ces modèles au catalogue (rareté, note « Comment le reconnaître »).
import { ls } from "./util.js";
import { Supa } from "./supa.js";
import { KNOWN_TYPES } from "./game.js";

const PENDING = "census_pending", SEEN = "census_seen", DAY = 86400e3, SEND_MS = 10 * 60e3;
// Codes génériques de l'OACI (planeur, ULM, ballon…) ou « type inconnu » : rien à ajouter au catalogue
const IGNORE = new Set(["ZZZZ", "GLID", "ULAC", "BALL", "GYRO", "UHEL", "PARA", "SHIP", "TWR", "GND", "GRND", "SERV", "EMER", "ZZZ"]);
let lastSend = 0;

/** À appeler avec la liste des avions du radar : note les codes inconnus (un même avion compte une fois par jour). */
export function noteUnknownTypes(list) {
  const now = Date.now();
  const seen = Object.fromEntries(Object.entries(ls.get(SEEN, {})).filter(([, t]) => now - t < DAY));
  const pending = ls.get(PENDING, {});
  let changed = false;
  for (const ac of list) {
    const code = (ac.type || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{2,4}$/.test(code) || KNOWN_TYPES.has(code) || IGNORE.has(code)) continue;
    if (/^C/.test(ac.category || "") || seen[ac.hex]) continue; // véhicules au sol et obstacles ; avion déjà compté
    seen[ac.hex] = now;
    const p = (pending[code] ||= { code, description: (ac.description || "").trim().slice(0, 80), category: ac.category || "", military: !!ac.military, count: 0 });
    p.count += 1;
    changed = true;
  }
  if (changed) { ls.set(SEEN, seen); ls.set(PENDING, pending); }
  if (Supa.isLoggedIn && Object.keys(pending).length && now - lastSend > SEND_MS) send();
}

async function send() {
  lastSend = Date.now();
  const items = Object.values(ls.get(PENDING, {})).slice(0, 30);
  if (!items.length) return;
  try {
    await Supa.rpc("report_unknown_types", { p_items: items });
    const left = ls.get(PENDING, {});
    for (const it of items) {
      const p = left[it.code];
      if (p && (p.count -= it.count) <= 0) delete left[it.code];
    }
    ls.set(PENDING, left);
  } catch { /* hors ligne ou serveur pas prêt : on réessaiera plus tard */ }
}

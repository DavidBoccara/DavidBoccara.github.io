// Joueurs bloqués : je ne vois plus leurs publications, commentaires, photos du concours ni leur place au classement,
// et nous ne pouvons plus être amis (l'amitié est supprimée). Côté serveur (supabase/blocks.sql : table user_blocks,
// RPC block_user / unblock_user, règles d'accès) le blocage marche dans les deux sens ; le joueur bloqué n'est pas
// prévenu. Copie locale par compte (clé `blocked_users:<id>`) pour un effet immédiat et si le serveur ne répond pas.
import { h, ls, toast, confirmBox } from "./util.js";
import { Supa } from "./supa.js";

const key = () => `blocked_users:${Supa.userId || "anon"}`;
const read = () => ls.get(key(), {});
const write = (v) => { ls.set(key(), v); window.dispatchEvent(new Event("planego-blocks")); };

export const Blocked = {
  /** Ce joueur est-il bloqué par moi ? */
  has: (id) => !!id && !!read()[id],
  /** [{ id, name, at }] du plus récent au plus ancien */
  list: () => Object.entries(read()).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.at || 0) - (a.at || 0)),
};

/** Bloquer un joueur (après confirmation). Renvoie true si c'est fait. */
export async function blockUser(id, name) {
  if (!Supa.isLoggedIn || !id || id === Supa.userId) return false;
  const who = name || "ce joueur";
  if (!(await confirmBox(`Bloquer ${who} ? Tu ne verras plus ses publications ni ses commentaires, et vous ne pourrez plus être amis. Il n'est pas prévenu. Tu peux le débloquer à tout moment dans ton Profil.`, "Bloquer", true))) return false;
  try { await Supa.rpc("block_user", { p_user: id }); }
  catch (e) { if (e.status !== 404) { toast(e.message); return false; } } // fonction pas encore installée : blocage local seulement
  write({ ...read(), [id]: { name: name || null, at: Date.now() } });
  toast(`${who} est bloqué`, 3500);
  return true;
}

export async function unblockUser(id, name) {
  try { await Supa.rpc("unblock_user", { p_user: id }); }
  catch (e) { if (e.status !== 404) { toast(e.message); return false; } }
  const all = read(); delete all[id]; write(all);
  toast(`${name || "Ce joueur"} est débloqué`, 3000);
  return true;
}

/** Après la connexion / la synchro : liste du serveur + blocages faits hors ligne envoyés au serveur. */
let syncing = false;
export async function syncBlocks() {
  if (syncing || !Supa.isLoggedIn) return;
  syncing = true;
  try {
    const rows = await Supa.select("user_blocks?select=blocked,created_at");
    const local = read(), merged = {};
    for (const r of rows) merged[r.blocked] = local[r.blocked] || { name: null, at: Date.parse(r.created_at) || Date.now() };
    for (const [id, v] of Object.entries(local)) {
      if (merged[id]) continue;
      try { await Supa.rpc("block_user", { p_user: id }); merged[id] = v; } catch { merged[id] = v; }
    }
    // Pseudos manquants (blocage fait depuis un autre appareil)
    const missing = Object.keys(merged).filter((id) => !merged[id].name);
    if (missing.length) {
      const ps = await Supa.select(`profiles?select=id,username&id=in.(${missing.join(",")})`).catch(() => []);
      for (const p of ps) merged[p.id] = { ...merged[p.id], name: p.username };
    }
    write(merged);
  } catch { /* table pas encore créée (supabase/blocks.sql) ou hors ligne : copie locale gardée */ }
  finally { syncing = false; }
}

/** Liste « Joueurs bloqués » du Profil (avec « Débloquer »), vide = rien. */
export function blockedList() {
  const box = h("div");
  const render = () => {
    const l = Blocked.list();
    box.replaceChildren(...(l.length ? [h("div.section", `Joueurs bloqués (${l.length})`), h("div.list", l.map((b) =>
      h("div.card.pad.row", h("div.grow", h("b", b.name || "Joueur")),
        h("button.btn.small.outline", { onclick: async () => { if (await unblockUser(b.id, b.name)) render(); } }, "Débloquer"))))] : []));
  };
  render();
  return box;
}

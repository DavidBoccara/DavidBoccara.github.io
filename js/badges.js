// Pastilles (petit nombre ambre) : sur l'onglet Profil de la barre du bas, et dans le Profil sur les vues « Amis »
// (demandes d'ami reçues, en attente) et « Admin » (administrateurs : signalements à traiter + nouveaux messages du
// formulaire de contact). Demandée par le propriétaire le 9/11/2026 : voir tout de suite une demande d'ami et y répondre.
// Lues sur le serveur (RPC my_badges) au démarrage, à la connexion, après chaque synchronisation, au retour dans l'appli,
// toutes les 2 minutes tant que l'appli est affichée, et aussitôt après une action (accepter, refuser, traiter un signalement).
// Événement « planego-badges » à chaque changement (app.js redessine la pastille de l'onglet, profile.js celles des vues).
import { Supa } from "./supa.js";
import { ls } from "./util.js";

const seenKey = () => "admin_msg_seen:" + Supa.userId;
let pending = null;

export const Badges = {
  friends: 0, reports: 0, messages: 0, lastMessage: 0,
  /** Ce qui attend l'administrateur (0 pour les autres joueurs). */
  get admin() { return this.reports + this.messages; },
  get total() { return this.friends + this.admin; },
  /** Relit les chiffres sur le serveur (une seule demande à la fois). */
  refresh() {
    if (!Supa.isLoggedIn) { set({}); return Promise.resolve(); }
    pending ||= Supa.rpc("my_badges", { p_msg_after: ls.get(seenKey(), 0) })
      .then((b) => set(b || {}))
      .catch(() => { /* hors ligne, ou fonction pas encore installée : on garde les chiffres d'avant */ })
      .finally(() => { pending = null; });
    return pending;
  },
  /** Console Admin › Messages ouverte : les messages affichés sont vus (plus comptés dans la pastille). */
  messagesSeen(maxId) {
    if (!Supa.userId || !maxId) return;
    ls.set(seenKey(), Math.max(Number(maxId) || 0, ls.get(seenKey(), 0)));
    if (Badges.messages) { Badges.messages = 0; emit(); }
  },
};

function set(b) {
  const next = { friends: b.friends | 0, reports: b.reports | 0, messages: b.messages | 0, lastMessage: b.last_message | 0 };
  const changed = Object.keys(next).some((k) => Badges[k] !== next[k]);
  Object.assign(Badges, next);
  if (changed) emit();
}
function emit() { window.dispatchEvent(new Event("planego-badges")); }

// Relectures automatiques
Supa.onChange(() => { set({}); Badges.refresh(); });
window.addEventListener("planego-synced", () => Badges.refresh());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") Badges.refresh(); });
setInterval(() => { if (document.visibilityState === "visible") Badges.refresh(); }, 2 * 60e3);
Badges.refresh();

/** Pastille à mettre dans un bouton (null si 0). */
export function badgeEl(n, cls = "") {
  if (!n) return null;
  const s = document.createElement("span");
  s.className = "badge" + (cls ? " " + cls : "");
  s.textContent = n > 9 ? "9+" : String(n);
  s.setAttribute("data-notr", "");
  return s;
}

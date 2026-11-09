// Photos des avions signalées par les joueurs (demandé par le propriétaire le 9/11/2026) : bouton « Signaler » dans le coin
// de la photo de l'appareil (fiche d'un avion du Scanner, « Le plus proche », fiche d'une publication). Raisons : ce n'est pas
// cet avion (autre modèle), ce n'est pas un avion, photo choquante, autre.
// - Pour le joueur qui signale : retirée tout de suite (liste sur le téléphone, clé `ac_photo_flags`), une autre photo est
//   montrée, et les vignettes du Scanner se mettent à jour (événement `planego-photoflag`).
// - Pour tous : à partir de 3 joueurs différents (AC_FLAG_MIN), ou dès que l'administrateur la retire (console › Signalements) :
//   table aircraft_photo_flags (reports >= 3, supabase/aircraft_photo_flags.sql), relue au plus toutes les heures.
// - aircraftPhotos (net.js) écarte ces photos partout où elle sert (vignettes, fiches, jeu « Sur la carte »), et le quiz aussi
//   (PhotoFlags de quizkit.js) : un mauvais modèle fausserait la question. L'inverse non : une photo retirée du quiz parce
//   qu'elle « donne la réponse » reste utile dans le Scanner.
import { Supa } from "./supa.js";
import { h, ls, modal, toast } from "./util.js";

export const AC_FLAG_MIN = 3;
const KEY = "ac_photo_flags", CACHE = "ac_photo_flags_server", TTL = 3600e3;

/** Clé d'une photo : nom du fichier pour Wikimedia (toutes tailles confondues), sinon son adresse sans paramètres. */
export const photoKey = (url) => {
  const u = url || "";
  const m = /(?:upload|thumb)\.wikimedia\.org\/wikipedia\/[^/]+\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(u);
  if (m) { try { return "wiki:" + decodeURIComponent(m[1]); } catch { return "wiki:" + m[1]; } }
  return u.split(/[?#]/)[0];
};

const mine = () => ls.get(KEY, []);
let server = new Set(ls.get(CACHE, { at: 0, list: [] }).list);

export const AcFlags = {
  /** Photo retirée : signalée par moi, par au moins 3 joueurs, ou retirée par l'administrateur ? */
  has(url) {
    const k = photoKey(url);
    return !!k && (server.has(k) || mine().includes(k));
  },
  /** Liste du serveur, relue au plus toutes les heures (force : tout de suite). */
  async refresh(force = false) {
    const c = ls.get(CACHE, { at: 0, list: [] });
    if (!force && Date.now() - c.at < TTL) return;
    try {
      const rows = await Supa.select(`aircraft_photo_flags?select=photo&reports=gte.${AC_FLAG_MIN}&limit=5000`);
      server = new Set(rows.map((r) => r.photo));
      ls.set(CACHE, { at: Date.now(), list: [...server] });
    } catch { /* hors ligne : on garde la dernière liste */ }
  },
  /** Signale une photo ; renvoie le nombre de joueurs qui l'ont signalée (null si inconnu ou hors ligne). */
  async add(url, reason) {
    const k = photoKey(url);
    if (!k) return null;
    ls.set(KEY, [...new Set([...mine(), k])].slice(-500));
    window.dispatchEvent(new CustomEvent("planego-photoflag", { detail: k }));
    if (!Supa.isLoggedIn) return null;
    const n = await Supa.rpc("flag_aircraft_photo", { p_photo: k, p_reason: reason }).catch(() => null);
    return typeof n === "number" ? n : null;
  },
};
setTimeout(() => AcFlags.refresh(), 2500);

const REASONS = [
  ["wrong", "Ce n'est pas cet avion", "Autre modèle, ou autre appareil que celui annoncé"],
  ["not_plane", "Ce n'est pas un avion", "Personnes, bâtiment, paysage, document…"],
  ["shocking", "Photo choquante ou inappropriée", ""],
  ["other", "Autre problème", ""],
];

/** Raison du signalement (null si annulé), avec ce qui va se passer. */
function askReason() {
  return new Promise((resolve) => {
    let done = false;
    const pick = (id) => { done = true; m.close(); resolve(id); };
    const m = modal({
      title: "Signaler cette photo ?",
      body: [
        h("div.choice-list", REASONS.map(([id, label, sub]) => h("button.choice", { type: "button", onclick: () => pick(id) },
          h("span", label), sub ? h("small", sub) : null))),
        h("div.flag-how", h("b", "Comment ça marche"), h("ul",
          h("li", "Pour toi : la photo disparaît tout de suite, une autre photo de l'avion est montrée si possible."),
          h("li", `Pour tout le monde : quand ${AC_FLAG_MIN} joueurs différents l'ont signalée, elle est retirée pour tous (Scanner et quiz).`),
          h("li", "Les autres joueurs ne voient pas qui a signalé, et ça ne change rien à tes XP."))),
        !Supa.isLoggedIn && h("p.small.dim", "Tu n'es pas connecté : ton signalement reste sur cet appareil et ne compte pas pour les autres joueurs."),
      ].filter(Boolean),
      buttons: [{ label: "Annuler" }],
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

/**
 * Bouton « Signaler » dans le coin d'une photo d'avion (à placer dans un conteneur en position relative).
 * getUrl() : adresse de la photo affichée ; onFlagged() : passer à une autre photo.
 */
export function acFlagButton(getUrl, onFlagged) {
  const b = h("button.photo-flag", { type: "button", title: "Signaler cette photo" }, "Signaler");
  b.onclick = async (e) => {
    e.preventDefault(); e.stopPropagation();
    const url = getUrl();
    if (!url) return;
    const reason = await askReason();
    if (!reason) return;
    b.disabled = true;
    const n = await AcFlags.add(url, reason);
    b.disabled = false;
    toast(n == null ? "Merci ! Tu ne reverras plus cette photo"
      : n >= AC_FLAG_MIN ? `Merci ! ${n} joueurs l'ont signalée : elle est retirée pour tout le monde`
      : `Merci ! Signalée par ${n} joueur${n > 1 ? "s" : ""} sur les ${AC_FLAG_MIN} nécessaires. Tu ne la reverras plus.`, 5000);
    onFlagged?.();
  };
  return b;
}

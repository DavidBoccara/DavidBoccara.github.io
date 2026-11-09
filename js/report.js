// Signalement des publications des joueurs (feed, page de la publication, concours) : pas d'avion sur la photo,
// photo obscène ou choquante, pas sa photo, autre. À 5 joueurs différents, la publication est supprimée pour tous
// (photo effacée du serveur, XP retirés à son auteur) : voir supabase/reports.sql et la fonction serveur report-catch.
// L'auteur est prévenu à son prochain passage dans l'appli (noticeRemovals), comme pour une publication retirée par
// l'administrateur (console Admin : raison « admin » dans catch_removals.reasons).
import { h, ls, modal, toast, icon } from "./util.js";
import { Supa } from "./supa.js";
import { Cloud } from "./cloud.js";
import { prettyModel } from "./game.js";
import { blockUser } from "./blocks.js";

export const REPORT_MIN = 5;
export const REASONS = [
  { id: "no_plane", label: "Pas d'avion sur la photo", text: "pas d'avion sur la photo" },
  { id: "obscene", label: "Photo obscène ou choquante", text: "photo obscène ou choquante" },
  { id: "not_own", label: "Pas sa photo (trouvée sur internet…)", text: "photo qui n'est pas la tienne" },
  { id: "other", label: "Autre contenu inapproprié", text: "contenu inapproprié" },
];

/** Publications que j'ai signalées : je ne les vois plus. */
const KEY = "reported_catches";
export const Reported = {
  has: (id) => ls.get(KEY, []).includes(id),
  add: (id) => ls.set(KEY, [...new Set([...ls.get(KEY, []), id])].slice(-500)),
};

/** Fenêtre « 🚩 Signaler cette publication » : choix de la raison puis envoi. Renvoie {reports, removed} ou null. */
export function reportCatch(catchId, authorName, authorId = null) {
  return new Promise((resolve) => {
    let result = null, busy = false;
    const buttons = REASONS.map((r) => h("button.btn.outline.block", { onclick: () => send(r) }, r.label));
    const m = modal({
      title: "Signaler cette publication",
      body: [
        `Quel est le problème avec la photo de ${authorName || "ce joueur"} ?`,
        h("div.report-reasons", buttons),
        authorId && authorId !== Supa.userId && h("button.btn.outline.block.mt2", { onclick: async () => {
          if (await blockUser(authorId, authorName)) { result = { blocked: true }; m.close(); }
        } }, `Bloquer ${authorName || "ce joueur"}`),
        h("div.share-box", h("b", "Comment ça marche"), h("ul",
          h("li", "Tu ne verras plus cette publication."),
          h("li", `Quand ${REPORT_MIN} joueurs différents l'ont signalée, elle est supprimée pour tout le monde et ses XP sont retirés à son auteur, qui est prévenu.`),
          h("li", "Ton signalement est anonyme : l'auteur ne sait pas qui l'a signalée."),
          h("li", "Merci de signaler seulement les vrais problèmes."))),
      ],
      onClose: () => resolve(result),
      buttons: [{ label: "Annuler" }],
    });
    async function send(r) {
      if (busy) return;
      busy = true; buttons.forEach((b) => { b.disabled = true; });
      try {
        result = await Cloud.reportCatch(catchId, r.id);
        Reported.add(catchId);
        toast(result?.removed ? `Merci ! ${REPORT_MIN} joueurs l'ont signalée : la publication est supprimée`
          : "Merci ! Signalement envoyé : tu ne verras plus cette publication", 5000);
        m.close();
      } catch (e) {
        toast(e.message);
        busy = false; buttons.forEach((b) => { b.disabled = false; });
      }
    }
  });
}

/** Petit bouton 🚩 (publication d'un autre joueur seulement). onDone(result) après un signalement envoyé. */
export function reportButton(c, onDone, label = "") {
  if (!Supa.isLoggedIn || !c?.id || (c.userId || c.user?.id) === Supa.userId) return null;
  return h("button.post-flag", { type: "button", title: "Signaler cette publication", "aria-label": "Signaler cette publication", onclick: async (e) => {
    e.stopPropagation();
    const r = await reportCatch(c.id, c.user?.username, c.userId || c.user?.id);
    if (r) onDone?.(r);
  } }, label || icon("flag", 15));
}

// ---------- Côté auteur : mes publications supprimées après 5 signalements ----------
const SEEN = "removals_seen";
let checked = false;
/** Une fois par lancement (après la synchro) : prévient le joueur si une de ses publications a été supprimée. */
export async function noticeRemovals() {
  if (checked || !Supa.isLoggedIn) return;
  checked = true;
  let rows;
  try { rows = await Cloud.myRemovals(); } catch { checked = false; return; }
  const seen = new Set(ls.get(SEEN, []));
  const fresh = rows.filter((r) => !seen.has(r.id) && Date.now() - Date.parse(r.removed_at) < 30 * 86400e3);
  if (!fresh.length) return;
  ls.set(SEEN, [...seen, ...fresh.map((r) => r.id)].slice(-200));
  const reasonOf = (r) => {
    if (r.reasons?.admin) return REASONS.find((x) => x.id === r.reasons.admin)?.text || "contenu inapproprié"; // retirée par la modération
    const [top] = Object.entries(r.reasons || {}).sort((a, b) => b[1] - a[1]);
    return REASONS.find((x) => x.id === top?.[0])?.text || "contenu inapproprié";
  };
  modal({
    title: fresh.length > 1 ? `${fresh.length} publications retirées` : "Une publication retirée",
    body: [
      ...fresh.map((r) => {
        const what = [prettyModel(r.model || r.type), r.registration].filter(Boolean).join(", ");
        if (r.reasons?.admin) return `Ta photo${what ? ` (${what})` : ""} a été retirée par la modération (raison : ${reasonOf(r)}). Ses ${r.xp} XP ont été retirés.`;
        return `Ta photo${what ? ` (${what})` : ""} a été signalée par ${REPORT_MIN} joueurs (raison principale : ${reasonOf(r)}). Elle a été supprimée et ses ${r.xp} XP ont été retirés.`;
      }),
      "Pour que tout le monde s'amuse, publie seulement tes propres photos, où l'on voit bien l'avion.",
    ],
  });
}

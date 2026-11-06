// Feed › Concours de la semaine : la photo de la semaine, ouverte à tous les joueurs.
// Chaque joueur propose une de ses photos prises dans la semaine ; tout le monde vote.
// La jauge d'exposition d'une photo (aiguille de 0 à 100) monte avec les votes que son auteur donne aux autres ;
// la photo qui reçoit le plus de votes gagne.
// Dimanche à minuit (heure de Paris), la photo la plus votée gagne et son auteur reçoit 200 XP.
import { LOCALE } from "../i18n.js";
import { h, modal, toast, confirmBox, timeAgo, rarityMark, infoButton } from "../util.js";
import { Supa } from "../supa.js";
import { Weekly, profileFrom, sync } from "../cloud.js";
import { Collection, entryPhoto, entryModel, entryRarity } from "../store.js";
import { rarityByName, prettyModel, flagOf } from "../game.js";
import { renderHud } from "../app.js";
import { aircraftInfoCard } from "../ui.js";
import { Reported, reportButton } from "../report.js";

export const WEEK_PRIZE_XP = 200;
const photoUrl = (path) => (path ? Supa.publicUrl("photos", path) : "");
const dayFmt = (ms) => new Date(ms).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });

/** Petite jauge en demi-cercle avec une aiguille, de 0 à 100. */
export function gauge(score, { size = 74, label = "Exposition" } = {}) {
  const s = Math.max(0, Math.min(100, Math.round(score || 0)));
  const a = Math.PI * (1 - s / 100); // 180° (0) → 0° (100)
  const nx = 50 + 34 * Math.cos(a), ny = 50 - 34 * Math.sin(a);
  const len = Math.PI * 40, fill = (len * s) / 100; // arc gris, puis la part atteinte en ambre (style « instrument »)
  const svg = `<svg viewBox="0 0 100 62" width="${size}" height="${Math.round(size * 0.62)}" aria-hidden="true">
    <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--line)" stroke-width="6"/>
    <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--accent)" stroke-width="6" stroke-dasharray="${fill.toFixed(1)} ${len.toFixed(1)}"/>
    <line x1="50" y1="50" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--text)" stroke-width="2" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="3.5" fill="var(--text)"/>
  </svg>`;
  return h("div.gauge", { title: `${label} : ${s} / 100` }, h("div", { html: svg }), h("div.gauge-v", `${s}`), h("div.gauge-l", label));
}

export function contestFeed(box) {
  let alive = true, state = null;
  const body = h("div");
  box.replaceChildren(body);

  async function load() {
    body.replaceChildren(h("div.spinner"));
    try {
      await sync(); renderHud(); // mes dernières photos doivent être sur le serveur pour participer
      state = await Weekly.state();
      if (alive) render();
    } catch (e) {
      if (!alive) return;
      body.replaceChildren(e.status === 404
        ? h("div.empty", "Le concours de la photo de la semaine arrive très bientôt !")
        : h("div.empty", `Impossible de charger le concours de la semaine (${e.message}).`, h("div.mt", h("button.btn.outline", { onclick: load }, "Réessayer"))));
    }
  }

  function render() {
    const endsAt = Date.parse(state.ends_at), start = endsAt - 7 * 86400e3;
    const entries = state.entries || [], meId = Supa.userId;
    const mine = entries.find((e) => e.user_id === meId);
    body.replaceChildren(...[
      intro(start, endsAt, entries.length),
      state.last_winner && winnerCard(state.last_winner),
      myCard(mine, start, endsAt, entries.length),
      h("h3", { style: { margin: "18px 0 8px" } }, entries.length ? `Les photos de la semaine (${entries.length})` : "Les photos de la semaine"),
      // (photos que j'ai signalées : masquées, le rang des autres ne change pas)
      entries.length ? h("div.list", entries.map((e, i) => !Reported.has(e.catch_id) && entryCard(e, i + 1, e.user_id === meId)).filter(Boolean))
        : h("div.empty", "Aucune photo pour l'instant : sois le premier à proposer la tienne !"),
    ].filter(Boolean));
  }

  function intro(start, endsAt, n) {
    const left = endsAt - Date.now(), d = Math.floor(left / 86400e3), hrs = Math.floor((left % 86400e3) / 3600e3);
    return h("div.card.pad.week-intro",
      h("div.row", h("div.grow", { style: { fontWeight: 800, color: "var(--amber)", fontSize: "17px" } }, "Concours de la semaine"),
        infoButton("Concours de la semaine", [
          `Propose ta plus belle photo de la semaine : c'est la communauté qui vote, et dimanche à minuit la photo qui a reçu le plus de votes gagne ${WEEK_PRIZE_XP} XP.`,
          "Pour que ta photo reste bien visible et continue de recevoir des votes, vote toi aussi pour les photos des autres : chaque vote remplit ta jauge d'exposition.",
        ], { small: true })),
      h("div.small", `Du ${dayFmt(start)} au ${dayFmt(endsAt - 1)} · fin des votes dans ${d > 0 ? `${d} j ${hrs} h` : `${hrs} h ${Math.floor((left % 3600e3) / 60e3)} min`}`));
  }

  function winnerCard(w) {
    const r = rarityByName(w.rarity), who = w.username || "Un spotter";
    return h("div.card.week-winner", { style: { borderColor: "var(--amber)" } },
      w.photo_path && h("img", { src: photoUrl(w.photo_path), alt: "Photo gagnante", loading: "lazy" }),
      h("div.pad",
        h("div.kicker", { style: { color: "var(--amber)" } }, `Gagnant de la semaine du ${dayFmt(Date.parse(w.week))}`),
        h("div", h("b", who), ` — ${prettyModel(w.model || w.type) || "un avion"}`),
        h("div.small.mt", rarityMark(r, `${r.label} · ${w.votes} vote(s) · +${WEEK_PRIZE_XP} XP`))));
  }

  function myCard(mine, start, endsAt, n) {
    const goal = state.goal || 1, cast = state.my_votes || 0;
    if (!mine) {
      return h("div.card.pad.mt",
        h("div", { style: { fontWeight: 800 } }, "Ta participation"),
        h("div.small.dim", "Tu n'as pas encore proposé de photo cette semaine."),
        h("button.btn.primary.block.mt", { onclick: () => choose(start, endsAt) }, "Choisir ma photo de la semaine"));
    }
    const toGo = Math.max(0, goal - cast);
    return h("div.card.pad.mt", { style: { borderColor: "var(--cyan)" } },
      h("div.row", { style: { alignItems: "center" } },
        h("img.week-thumb", { src: photoUrl(mine.photo_path), alt: "Ma photo" }),
        h("div.grow",
          h("div", { style: { fontWeight: 800 } }, "Ta photo de la semaine"),
          h("div.small", prettyModel(mine.model || mine.type) || "Un avion"),
          h("div.small.dim", `${mine.votes} vote(s) reçu(s)`)),
        gauge(mine.score)),
      h("div.small", { style: { marginTop: "8px", color: toGo ? "var(--amber)" : "var(--green)" } },
        toGo ? `Tu as voté pour ${cast} photo(s). Vote pour ${toGo} photo(s) de plus pour remplir ta jauge d'exposition.`
          : "Jauge d'exposition pleine : ta photo est parmi les plus visibles !"),
      h("div.row.mt",
        h("button.btn.small.outline.grow", { onclick: () => choose(start, endsAt) }, "Changer de photo"),
        h("button.btn.small.outline", { onclick: withdraw }, "Retirer")));
  }

  function entryCard(e, rank, isMine) {
    const r = rarityByName(e.rarity), user = profileFrom({ id: e.user_id, username: e.username, avatar_path: e.avatar_path, xp: e.user_xp });
    const av = h("img.avatar.sm", { alt: "", src: user.avatarUrl || "icons/avatar.svg" });
    av.onerror = () => { av.src = "icons/avatar.svg"; };
    const voteBtn = h("button.vote-btn" + (e.voted ? ".on" : "") + (isMine ? ".mine" : ""), { disabled: isMine },
      isMine ? "Ta photo" : e.voted ? "Voté" : "Voter");
    voteBtn.onclick = async () => {
      voteBtn.disabled = true;
      try { await Weekly.vote(e.id, !e.voted); state = await Weekly.state(); if (alive) render(); }
      catch (err) { toast(err.message); voteBtn.disabled = false; }
    };
    const model = prettyModel(e.model || e.type);
    return h("div.card.post.week-entry", { style: { borderColor: isMine ? "var(--cyan)" : "" } },
      h("div.head", h("div.rank", `#${rank}`), av, h("div.grow",
        h("div", h("b", user.username || "Un spotter"), model ? ` — ${model}` : "", e.military ? " · militaire" : ""),
        h("div.small.dim", `${timeAgo(Date.parse(e.taken_at))} · ${user.level.emblem} ${user.level.name}`)),
        gauge(e.score, { size: 62 })),
      h("img.photo", { src: photoUrl(e.photo_path), alt: "Photo de l'avion", loading: "lazy",
        // Photo en grand et fiche de l'avion (comme dans le Scanner)
        onclick: () => modal({ wide: true, body: [h("img.cover", { src: photoUrl(e.photo_path), alt: "", style: { borderRadius: "12px" } }),
          h("div.mt", h("b", user.username || "Un spotter"), model ? ` — ${model}` : ""),
          aircraftInfoCard({ hex: e.hex, type: e.type, model: e.model, military: e.military, rarity: r, xp: e.xp, takenAt: Date.parse(e.taken_at),
            countryIso: e.country_iso, countryName: e.country_name, registration: e.registration, callsign: e.callsign, operator: e.operator,
            route: e.route, flightKm: e.flight_km, distanceKm: e.distance_km, source: e.source })] }) }),
      h("div.tags", rarityMark(r),
        h("span.chip.small", `${e.votes} vote(s)`)),
      h("div.acts", { style: { justifyContent: "flex-end" } },
        reportButton({ id: e.catch_id, userId: e.user_id, user }, () => { if (alive) load(); }, "Signaler"), voteBtn));
  }

  /** Choisir parmi mes photos prises cette semaine (envoyées sur mon compte et validées). */
  function choose(start, endsAt) {
    const list = Collection.all().filter((x) => x.remoteId && !x.rejected && x.takenAt >= start && x.takenAt < endsAt);
    if (!list.length) {
      modal({ title: "Aucune photo cette semaine", body: "Seules les photos prises cette semaine (depuis lundi) peuvent participer. Attrape un avion et reviens ici !" });
      return;
    }
    const m = modal({ title: "Choisis ta photo de la semaine", wide: true, buttons: [{ label: "Annuler" }],
      body: [h("p.small.dim", "Touche la photo à proposer. Changer de photo plus tard efface les votes déjà reçus."),
        h("div.grid", list.map((x) => {
          const img = h("img", { alt: "" });
          entryPhoto(x).then((u) => { if (u) img.src = u; });
          const rr = entryRarity(x);
          return h("div.tile", { onclick: async () => {
            m.close();
            try { await Weekly.submit(x.remoteId); toast("Ta photo participe à la photo de la semaine !"); await load(); }
            catch (err) { toast(err.message); }
          } }, img, h("div.strip", { style: { background: rr.color } }), h("div.nm", entryModel(x) || "Avion"), h("div.rr", rarityMark(rr)));
        }))] });
  }

  async function withdraw() {
    if (!(await confirmBox("Retirer ta photo du concours ? Les votes qu'elle a reçus seront perdus.", "Retirer", true))) return;
    try { await Weekly.withdraw(); await load(); } catch (err) { toast(err.message); }
  }

  load();
  return () => { alive = false; };
}

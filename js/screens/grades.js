// Onglet Classement : amis, général, et liste des grades avec le barème.
import { Blocked } from "../blocks.js";
import { LOCALE } from "../i18n.js";
import { h, ls, toast } from "../util.js";
import { Supa } from "../supa.js";
import { Cloud, otherOf } from "../cloud.js";
import { linkPlayer } from "./player.js";
import { Player } from "../store.js";
import { LEVELS, RARITIES, MAX_PHOTO_KM, Quiz } from "../game.js";

export function grades(view) {
  let mode = ls.get("grades_mode", "friends");
  const seg = h("div.seg");
  const box = h("div.mt");
  view.append(seg, box);

  function render() {
    seg.replaceChildren(...[["friends", "Amis"], ["global", "Général"], ["grades", "Grades"]].map(([k, l]) =>
      h("button" + (mode === k ? ".on" : ""), { onclick: () => { mode = k; ls.set("grades_mode", k); render(); } }, l)));
    box.replaceChildren();
    if (mode === "grades") renderGrades(); else loadRanking(mode);
  }

  async function loadRanking(wanted) {
    const title = h("h1.title", wanted === "friends" ? "Classement des amis" : "Classement général");
    const sub = h("div.small.dim"), list = h("div.list.mt", h("div.spinner"));
    box.append(title, sub, list);
    if (!Supa.isLoggedIn) { list.replaceChildren(); sub.textContent = "Connecte-toi pour entrer dans le classement et te mesurer aux autres spotters."; return; }
    try {
      const me = await Cloud.profile();
      let players;
      if (wanted === "friends") {
        const fr = (await Cloud.friendships()).filter((f) => f.accepted).map((f) => otherOf(f, Supa.userId));
        players = [...fr, me].filter(Boolean).filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i).sort((a, b) => b.xp - a.xp);
        const rank = players.findIndex((p) => p.id === Supa.userId) + 1;
        sub.textContent = fr.length ? `Tu es ${rank}${rank === 1 ? "er" : "e"} sur ${players.length} dans ton escadrille.` : "Ajoute des amis (onglet Amis) pour lancer la compétition !";
      } else {
        players = await Cloud.leaderboard(100);
        const [rank, total] = await Promise.all([me ? Cloud.rankOf(me.xp) : 0, Cloud.playerCount()]);
        if (me) sub.textContent = `Ton rang : ${rank}${rank === 1 ? "er" : "e"} sur ${total} spotters`;
      }
      if (mode !== wanted) return;
      players = players.filter((p) => !Blocked.has(p.id)); // joueurs bloqués : retirés du classement affiché
      list.replaceChildren(...players.map((p, i) => {
        const av = h("img.avatar.sm", { alt: "", src: p.avatarUrl || "icons/avatar.svg" });
        av.onerror = () => { av.src = "icons/avatar.svg"; };
        // Ligne cliquable : page du joueur (ses photos si son profil est public, ou si c'est un ami)
        return linkPlayer(h("div.card.pad.row", { style: { borderColor: p.id === Supa.userId ? "var(--cyan)" : "" } },
          h("div", { style: { width: "38px", textAlign: "center", fontWeight: 800, fontSize: i < 3 ? "24px" : "15px" } }, `#${i + 1}`),
          av, h("div.grow", h("div", { style: { fontWeight: 700 } }, p.username + (p.id === Supa.userId ? "  (toi)" : "")),
            h("div.small.dim", `${p.level.emblem} Niv. ${p.level.number} · ${p.level.name}`)),
          h("span.chip", `${p.xp.toLocaleString(LOCALE)} XP`)), p.id);
      }));
    } catch (e) { list.replaceChildren(); toast(e.message); }
  }

  function renderGrades() {
    const xp = Player.bestXp(), cur = Player.level();
    box.append(h("h1.title", "Les grades"), h("div.list.mt", LEVELS.map((l) => {
      const done = l.number < cur.number, here = l.number === cur.number;
      const pct = done ? 100 : here ? (l.nextXp ? ((xp - l.minXp) / (l.nextXp - l.minXp)) * 100 : 100) : 0;
      return h("div.card.pad.row", { style: { opacity: !done && !here ? 0.6 : 1, borderColor: here ? "var(--cyan)" : "" } },
        h("div", { style: { fontSize: "30px" } }, l.emblem),
        h("div.grow", h("div", { style: { fontWeight: here ? 800 : 700 } }, `${l.number}. ${l.name}`),
          h("div.small.dim", done ? `✓ Atteint • dès ${l.minXp} XP` : here ? (l.nextXp ? `Ton grade • ${xp} / ${l.nextXp} XP` : "Ton grade • grade maximum !")
            : `À partir de ${l.minXp} XP (encore ${l.minXp - xp} XP)`),
          h("div.small", { style: { color: "var(--cyan)" } }, `Quiz : rayon de ${Quiz.radiusLabel(l)}${Quiz.bonusCount(l) ? ` · ${Quiz.bonusLabel(l)}` : ""}`),
          h("div.xpbar.cyan", h("i", { style: { width: pct + "%" } }))));
    })),
    h("div.section", "Barème"),
    h("div.kv.small", [
      "Rareté de l'avion :", ...RARITIES.map((r) => `  ${r.stars} ${r.label} : ${r.xp} XP`), "",
      "Distance du vol (depuis l'aéroport de départ, ou le pays d'immatriculation) :",
      "  moins de 300 km : ×1", "  300 à 1 000 km : ×1,2", "  1 000 à 3 000 km : ×1,5", "  3 000 à 6 000 km : ×2", "  plus de 6 000 km : ×2,5", "",
      "🆕 Premier avion d'un modèle : +50 %",
      `Un même avion ne rapporte qu'une fois, et seulement s'il est passé à moins de ${MAX_PHOTO_KM} km de toi.`, "",
      "Quiz : 5 XP par bonne réponse, ×2 dès 5 bonnes réponses d'affilée, ×3 dès 10… (maximum ×5).",
    ].join("\n")));
  }
  render();
}

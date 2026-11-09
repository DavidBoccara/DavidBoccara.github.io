// Onglet Classement : amis, général, et liste des grades avec le barème.
import { Blocked } from "../blocks.js";
import { LOCALE } from "../i18n.js";
import { h, ls, toast, gradeTag, icon, infoButton } from "../util.js";
import { Supa } from "../supa.js";
import { Cloud, otherOf } from "../cloud.js";
import { linkPlayer } from "./player.js";
import { Player } from "../store.js";
import { LEVELS, RARITIES, MAX_PHOTO_KM, Quiz, levelOf, likeXp } from "../game.js";

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
          av, h("div.grow", h("div", { style: { fontWeight: 700 } }, p.username + (p.id === Supa.userId ? "  (toi)" : ""), gradeTag(p.level)),
            h("div.small.dim", p.level.name)),
          h("span.chip", `${p.xp.toLocaleString(LOCALE)} XP`)), p.id);
      }));
    } catch (e) { list.replaceChildren(); toast(e.message); }
  }

  async function renderGrades() {
    // Profil en ligne pas encore chargé (vue ouverte directement) : XP, modèles et grade gardé viennent du serveur
    if (Supa.isLoggedIn && !Player.profile) Player.profile = await Cloud.profile().catch(() => null);
    if (mode !== "grades") return;
    const have = Player.have(), { xp, models, likes } = have, cur = Player.level(), g = Player.next();
    const kept = cur.number > levelOf({ ...have, floor: 1 }).number; // grade gardé d'avant les nouvelles règles (9/11/2026)
    const num = (n) => n.toLocaleString(LOCALE);
    // Une condition du grade suivant : icône, libellé, « 2 508 / 3 000 » (coché quand c'est bon) et barre
    const goal = (ico, label, have, need) => h("div.goal-row" + (have >= need ? ".ok" : ""), icon(ico, 16), h("span", label),
      h("span.v", `${num(have)} / ${num(need)}`, have >= need ? icon("check", 14) : null),
      h("div.xpbar", h("i", { style: { width: Math.min(100, (have / need) * 100) + "%" } })));
    // Carte « Ton grade » : grade actuel, puis ce qu'il manque pour le suivant et ce qu'il débloque
    const me = h("div.card.pad.mt.grade-me", h("div.kicker", "Ton grade"), h("div.gm-name", gradeTag(cur), cur.name),
      kept && h("div.small.dim", "Grade gardé : tu l'avais avant les nouvelles règles des grades."),
      g ? [h("div.kicker.gm-next", `Pour passer ${g.next.name}`),
        goal("xp", "XP", xp, g.next.minXp),
        g.next.minModels ? goal("camera", "Modèles photographiés", models, g.next.minModels) : null,
        g.next.minLikes ? goal("heart", "Likes reçus", likes, g.next.minLikes) : null,
        h("div.gm-unlock", h("span", icon("radar", 14), `Rayon ${Quiz.radiusLabel(g.next)}`),
          Quiz.bonusCount(g.next) ? h("span", icon("quiz", 14), Quiz.bonusLabel(g.next)) : null)]
        : h("div.small.dim", "Grade maximum : radar infini"));
    // Tableau de tous les grades : ce qu'il faut (XP, modèles, likes reçus) et le rayon du quiz qu'il donne
    const col = (ico, label) => h("th", icon(ico, 14), label);
    const table = h("table.grade-table",
      h("thead", h("tr", col("rank", "Grade"), col("xp", "XP"), col("camera", "Modèles"), col("heart", "Likes"), col("radar", "Rayon"))),
      h("tbody", LEVELS.map((l) => h("tr" + (l.number === cur.number ? ".here" : l.number > cur.number ? ".locked" : ""),
        h("td", h("span.gt-cell", gradeTag(l), l.name)), h("td", num(l.minXp)), h("td", l.minModels || "—"),
        h("td", l.minLikes || "—"), h("td", Number.isFinite(Quiz.radiusKm(l)) ? Quiz.radiusLabel(l) : "∞")))));
    // Barème des XP derrière le bouton « i » (pas de long texte à l'écran)
    const bareme = () => h("div.kv.small", [
      "Dès « Guetteur », chaque grade demande aussi des modèles différents photographiés (photos validées ; les photos anciennes ne comptent pas) et des likes reçus d'autres joueurs : les jeux seuls ne suffisent plus.", "",
      "Like reçu sur une de tes publications (pas de toi), selon le grade de celui qui like :", ...LEVELS.map((l) => `  ${l.name} : ${likeXp(l)} XP`), "",
      "Rareté de l'avion :", ...RARITIES.map((r) => `  ${r.stars} ${r.label} : ${r.xp} XP`), "",
      "Distance du vol (depuis l'aéroport de départ, ou le pays d'immatriculation) :",
      "  moins de 300 km : ×1", "  300 à 1 000 km : ×1,2", "  1 000 à 3 000 km : ×1,5", "  3 000 à 6 000 km : ×2", "  plus de 6 000 km : ×2,5", "",
      "🆕 Premier avion d'un modèle : +50 %",
      `Un même avion ne rapporte qu'une fois, et seulement s'il est passé à moins de ${MAX_PHOTO_KM} km de toi.`, "",
      `Quiz : ${Quiz.BASE_XP} XP par bonne réponse, ×2 dès 5 bonnes réponses d'affilée (maximum ×${Quiz.MAX_MULT}).`,
    ].join("\n"));
    box.append(h("div.row", h("h1.title.grow", "Les grades"), infoButton("Barème", bareme)), me, h("div.card.pad.mt.grade-wrap", table));
  }
  render();
}

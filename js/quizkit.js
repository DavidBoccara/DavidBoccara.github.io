// Outils communs aux modes du Quiz du ciel : préparation d'une question (nom + photo), mémoire des avions
// déjà proposés en entraînement, note « Comment le reconnaître » après une erreur.
import { LOCALE } from "./i18n.js";
import { h, ls, modal, toast, confirmBox } from "./util.js";
import { Radar } from "./radar.js";
import { Wiki } from "./net.js";
import { quizName, buildQuestion, recognitionTip, familyTip, Quiz } from "./game.js";
import { wikiQuery } from "./ui.js";
import { Supa } from "./supa.js";
import { bonusQuestions, flagAiQuestion } from "./wikiquiz.js";
import { Sound } from "./sound.js";

// ---------- Rayon de jeu (selon le grade), porté par le bouton d'action du quiz ----------
/** Cercles des 8 grades : le mien plein, les précédents en trait, les suivants en pointillés. */
const ringsSvg = (lvl, size) => {
  const cur = Math.min(Math.max(lvl.number - 1, 0), Quiz.RADIUS_KM.length - 1);
  const rings = Quiz.RADIUS_KM.map((_, i) =>
    `<circle cx="32" cy="32" r="${(5 + i * 3.7).toFixed(1)}" class="${i < cur ? "in" : i === cur ? "cur" : "out"}"/>`).reverse().join("");
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${rings}<circle cx="32" cy="32" r="1.8" class="me"/></svg>`;
};

/**
 * Bouton d'action du quiz qui porte le rayon de jeu (« Chercher un avion », « Avion suivant », « Commencer le quiz du jour ») :
 * cercles des grades à gauche, texte au milieu, rayon en grand à droite. km : rayon (Infinity = radar infini).
 * btn.busy(texte) : recherche en cours (bouton inactif) ; btn.busy(null) : de nouveau cliquable.
 */
export function radiusButton({ km, lvl, label, sub, onClick }) {
  const finite = Number.isFinite(km), m = finite ? /^([\d\s,.\u202f]+)\s*(.*)$/.exec(Quiz.kmLabel(km)) : null;
  const text = h("span.rb-label", label);
  const btn = h("button.radius-btn", { type: "button", onclick: () => { if (!btn.disabled) onClick?.(); },
    "aria-label": `${label} — rayon de jeu : ${finite ? Quiz.kmLabel(km) : "infini"}` },
    h("span.rb-rings", { html: ringsSvg(lvl, 46) }),
    h("span.rb-text", text, h("span.rb-sub", sub ?? `Rayon de jeu · grade ${lvl.number}`)),
    h("span.rb-value", m ? [m[1].trim(), h("small", m[2] || "")] : "Infini"));
  btn.busy = (t) => { btn.disabled = !!t; btn.classList.toggle("busy", !!t); text.textContent = t || label; };
  return btn;
}

/** Petite ligne sous le bouton : rayon (et questions bonus) au grade suivant. */
export function radiusNext(lvl, next, xp) {
  const bonus = next && Quiz.bonusLabel(next);
  return h("div.rb-next", next
    ? `Au grade ${next.name} : ${Quiz.radiusLabel(next)}${bonus ? ` + ${bonus}` : ""}${xp != null && next.minXp > xp ? ` (encore ${(next.minXp - xp).toLocaleString(LOCALE)} XP)` : ""}`
    : "Grade maximum : radar infini");
}

/**
 * Questions bonus sur l'avion qui vient d'être reconnu (les 3 modes du quiz, à partir du grade 4), d'après sa page
 * Wikipédia (wikiquiz.js) : une à la fois, Quiz.BONUS_XP par bonne réponse, sans effet sur la série. n = Quiz.bonusCount(grade).
 * onAward(points, id) : bonne réponse. xp: false = sans points (Entraînement). La carte disparaît si Wikipédia n'a rien d'utilisable.
 */
export function bonusBlock(q, n, { onAward, xp = true } = {}) {
  const gain = xp ? `+${Quiz.BONUS_XP} XP` : "sans points";
  const box = h("div.card.pad.mt.bonus", h("div.bonus-head", h("span.bonus-k", n > 1 ? `${n} questions bonus` : "Question bonus"),
    h("span.bonus-xp", "recherche sur Wikipédia…")));
  bonusQuestions(q, n).then((list) => {
    if (!list.length) { box.remove(); return; }
    let i = 0, good = 0;
    const step = () => {
      const b = list[i];
      let done = false;
      const out = h("div.bonus-out");
      const opts = b.options.map((o) => h("button.opt", { onclick: () => choose(o) }, o));
      box.replaceChildren(
        h("div.bonus-head", h("span.bonus-k", list.length > 1 ? `Question bonus ${i + 1}/${list.length}` : "Question bonus"), h("span.bonus-xp", gain)),
        h("div.bonus-q", b.text), ...opts, out);
      function choose(o) {
        if (done) return;
        done = true;
        const ok = o === b.answer;
        markOptions(opts, b.answer, o);
        if (ok) { good++; if (xp) onAward?.(Quiz.BONUS_XP, b.id); }
        const last = i === list.length - 1;
        // Question écrite par l'IA : on peut la signaler (réponse fausse, question mal posée) ; retirée à 3 joueurs
        const flag = b.ai && h("button.link-btn.bonus-flag", { onclick: async () => {
          const yes = await confirmBox(["Signaler cette question ?", "Elle a été écrite par une IA d'après l'article Wikipédia. Signale-la si la réponse est fausse ou si la question est mal posée : elle est retirée pour tout le monde dès que 3 joueurs l'ont signalée."], "Signaler");
          if (!yes) return;
          flag.disabled = true;
          try { await flagAiQuestion(b); flag.textContent = "Question signalée, merci"; } catch (e) { flag.disabled = false; toast(e.message); }
        } }, "Signaler cette question");
        out.replaceChildren(
          h("div.bonus-verdict" + (ok ? ".ok" : ".ko"), ok ? (xp ? `Bonne réponse ! +${Quiz.BONUS_XP} XP` : "Bonne réponse !") : `Raté : c'était « ${b.answer} ».`),
          h("div.small.dim", b.explain),
          flag || "",
          last ? h("div.bonus-end", list.length > 1 ? `Bonus : ${good} bonne${good > 1 ? "s" : ""} réponse${good > 1 ? "s" : ""} sur ${list.length} · ` : "",
                h("a", { href: b.pageUrl, target: "_blank", rel: "noopener" }, "Lire l'article Wikipédia"))
            : h("button.btn.outline.small.mt", { onclick: () => { i++; step(); } }, "Question bonus suivante"));
      }
    };
    step();
  }).catch(() => box.remove());
  return box;
}

// ---------- Photos signalées « 🚩 Cette photo donne la réponse » ----------
// Retirée tout de suite pour le joueur qui la signale, et pour tous à partir de 5 joueurs différents (serveur).
const FLAG_KEY = "quiz_flags", FLAG_CACHE = "quiz_flags_server2", FLAG_TTL = 6 * 3600e3, FLAG_MIN = 5;
/** Clé d'une photo : nom du fichier pour Wikimedia (toutes tailles confondues), sinon son adresse sans paramètres. */
export const photoKey = (url) => {
  const u = url || "";
  const m = /(?:upload|thumb)\.wikimedia\.org\/wikipedia\/[^/]+\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(u);
  if (m) { try { return "wiki:" + decodeURIComponent(m[1]); } catch { return "wiki:" + m[1]; } }
  return u.split(/[?#]/)[0];
};
const myFlags = () => ls.get(FLAG_KEY, []).map(photoKey); // (anciennes clés converties)
let serverFlags = new Set(ls.get(FLAG_CACHE, { at: 0, list: [] }).list);
export const PhotoFlags = {
  /** Photo retirée du quiz : signalée par moi, ou par au moins 5 joueurs ? */
  has: (url) => { const k = photoKey(url); return serverFlags.has(k) || myFlags().includes(k); },
  /** Liste du serveur (photos signalées par au moins 5 joueurs), relue au plus toutes les 6 heures. */
  async refresh() {
    const c = ls.get(FLAG_CACHE, { at: 0, list: [] });
    if (Date.now() - c.at < FLAG_TTL) return;
    try {
      const rows = await Supa.select(`quiz_photo_flags?select=photo&reports=gte.${FLAG_MIN}&limit=5000`);
      serverFlags = new Set(rows.map((r) => r.photo));
      ls.set(FLAG_CACHE, { at: Date.now(), list: [...serverFlags] });
    } catch { /* hors ligne : on garde la dernière liste */ }
  },
  /** Signale une photo ; renvoie le nombre de joueurs qui l'ont signalée (null si inconnu). */
  async add(url) {
    const k = photoKey(url);
    if (!k) return null;
    ls.set(FLAG_KEY, [...new Set([...myFlags(), k])].slice(-500));
    if (!Supa.isLoggedIn) return null;
    const n = await Supa.rpc("flag_quiz_photo", { p_photo: k }).catch(() => null);
    return typeof n === "number" ? n : null;
  },
};
setTimeout(() => PhotoFlags.refresh(), 2000);

/** Photos possibles, sans les photos retirées. */
export const usablePhotos = (urls) => [...new Set(urls.filter(Boolean))].filter((u) => !PhotoFlags.has(u));

/**
 * Photo d'une question : celle de l'appareil (adsbdb), sinon la photo de l'article Wikipédia du modèle, sinon
 * (photo signalée ou introuvable) une autre photo du modèle sur Wikimedia Commons. null si aucune ne s'affiche.
 */
export async function questionPhoto(ownUrl, wikiQ, name) {
  for (const u of usablePhotos([ownUrl])) if (await loads(u)) return u;
  const wiki = await Wiki.find(wikiQ).catch(() => null);
  for (const u of usablePhotos([wiki?.imageUrl, wiki?.thumbnailUrl])) if (await loads(u)) return u;
  const alt = await Wiki.altPhotos(wiki && !wiki.searchOnly ? wiki.title : name).catch(() => []);
  for (const u of usablePhotos(alt).slice(0, 4)) if (await loads(u)) return u;
  return null;
}

/**
 * Photo de la question, avec un petit « 🚩 Signaler » discret dans son coin, affiché seulement après la réponse
 * (photo qui donne la réponse : nom du modèle peint sur l'avion, légende…). Une confirmation évite les appuis
 * par erreur. Appeler `photo.showFlag()` une fois la réponse donnée.
 */
export function quizPhoto(q, cls = "") {
  const img = h("img.quiz-photo", { src: q.photoUrl, alt: "Photo de l'avion à reconnaître" });
  const flag = h("button.photo-flag", { type: "button", style: { display: "none" }, title: "Signaler une photo qui donne la réponse" }, "Signaler");
  const wrap = h("div.quiz-photo-wrap" + cls, img, flag);
  flag.onclick = async (e) => {
    e.stopPropagation();
    if (!(await confirmFlag())) return;
    flag.disabled = true; flag.textContent = "…";
    const n = await PhotoFlags.add(q.photoUrl);
    flag.textContent = "Signalée";
    toast(n == null ? "Merci ! Tu ne reverras plus cette photo"
      : n >= FLAG_MIN ? `Merci ! ${n} joueurs l'ont signalée : elle est remplacée pour tout le monde`
      : `Merci ! Signalée par ${n} joueur${n > 1 ? "s" : ""} sur les ${FLAG_MIN} nécessaires. Tu ne la reverras plus.`, 5000);
  };
  wrap.showFlag = () => { flag.style.display = ""; };
  return wrap;
}

/** Fenêtre de confirmation qui explique comment marche le signalement ; true si le joueur confirme. */
const confirmFlag = () => new Promise((resolve) => {
  let ok = false;
  modal({
    title: "Signaler cette photo ?",
    body: [
      "À faire seulement si la photo donne la réponse : nom du modèle écrit sur l'avion, légende, logo du constructeur…",
      h("div.flag-how", h("b", "Comment ça marche"), h("ul",
        h("li", "Pour toi : la photo disparaît tout de suite, tu ne la reverras plus dans le quiz."),
        h("li", `Pour tout le monde : quand ${FLAG_MIN} joueurs différents l'ont signalée, elle est retirée du quiz de tous les joueurs.`),
        h("li", "Une autre photo du même modèle d'avion sera montrée à la place."),
        h("li", "Les autres joueurs ne voient pas qui a signalé, et ça ne change rien à tes XP."))),
      !Supa.isLoggedIn && h("p.small.dim", "Tu n'es pas connecté : ton signalement reste sur cet appareil et ne compte pas pour les autres joueurs."),
    ].filter(Boolean),
    onClose: () => resolve(ok),
    buttons: [{ label: "Annuler" }, { label: "Signaler", primary: true, onClick: () => { ok = true; } }],
  });
});

/** L'image se charge-t-elle ? (12 s au plus) */
export const loads = (url) => new Promise((res) => {
  const img = new Image();
  const t = setTimeout(() => res(false), 12000);
  img.onload = () => { clearTimeout(t); res(true); };
  img.onerror = () => { clearTimeout(t); res(false); };
  img.src = url;
});

/**
 * Première question possible (nom connu + photo) dans la liste d'avions.
 * avoid : modèle(s) à éviter si un autre est disponible (sinon pris en dernier recours) ;
 * onFail(hex) : appelé pour un avion impossible à présenter (pas de nom ou pas de photo).
 */
export async function pickQuestion(list, { avoid = null, tries = 8, onFail = null } = {}) {
  const avoided = new Set([].concat(avoid || []));
  let fallback = null;
  for (const ac of list.slice(0, tries)) {
    const extra = await Radar.extra(ac).catch(() => null);
    const name = quizName(ac, extra);
    if (!name) { onFail?.(ac.hex); continue; }
    const url = await questionPhoto(extra?.info?.photoUrl, wikiQuery.ac(ac), name);
    if (!url) { onFail?.(ac.hex); continue; }
    const q = buildQuestion(ac, extra, url);
    if (!q) { onFail?.(ac.hex); continue; }
    q.wiki = wikiQuery.ac(ac); // article Wikipédia du modèle (questions bonus du quiz en direct)
    if (avoided.has(q.answer)) { fallback ||= q; continue; } // modèle proposé récemment : en dernier recours
    return q;
  }
  return fallback;
}

/** Avions déjà proposés en entraînement (pendant 6 h), du plus ancien au plus récent : on fait tourner les avions proches. */
const SEEN_KEY = "quiz_test_seen", SEEN_MS = 6 * 3600e3;
export const PracticeSeen = {
  list: () => ls.get(SEEN_KEY, []).filter((x) => Date.now() - x.at < SEEN_MS),
  /** hex → rang (0 = proposé il y a le plus longtemps). */
  order: () => new Map(PracticeSeen.list().map((x, i) => [x.hex, i])),
  lastAnswer: () => PracticeSeen.list().at(-1)?.answer || null,
  /** Modèles des n dernières questions (pour varier les modèles). */
  recentAnswers: (n = 3) => PracticeSeen.list().slice(-n).map((x) => x.answer),
  add: (q) => ls.set(SEEN_KEY, [...PracticeSeen.list().filter((x) => x.hex !== q.hex), { hex: q.hex, answer: q.answer, at: Date.now() }].slice(-200)),
};

/** Après une erreur : petite note pour apprendre à reconnaître l'avion (et celui choisi par erreur). */
export function tipCard(q, choice) {
  const tip = recognitionTip(q.answer, q.type), other = recognitionTip(choice);
  return h("div.card.pad.mt", { style: { borderColor: "var(--cyan)", fontSize: "14px", lineHeight: 1.5 } },
    h("div", { style: { fontWeight: 800, color: "var(--cyan)", marginBottom: "4px" } }, tip ? "Comment le reconnaître" : "Astuce"),
    h("div", tip || familyTip(q.kind)),
    other && h("div.small.dim", { style: { marginTop: "8px" } }, `À ne pas confondre avec ${choice} : ${other}`));
}

/** Marque les boutons de réponse (bonne en vert, mauvaise en rouge) et les désactive. */
export function markOptions(opts, answer, choice) {
  Sound.answer(choice === answer);
  opts.forEach((b) => {
    b.disabled = true;
    if (b.textContent === answer) { b.classList.add("good"); b.textContent = "✓ " + answer; }
    else if (b.textContent === choice) { b.classList.add("bad"); b.textContent = "✗ " + choice; }
  });
}

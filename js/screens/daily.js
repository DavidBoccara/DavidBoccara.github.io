// Quiz › Quiz du jour : une question par avion passé aujourd'hui dans votre rayon de jeu (le même que le quiz
// « En direct », selon le grade ; radar actif, passages notés jusqu'à 30 km).
// Une seule partie par jour : commencée, elle se reprend où on l'a laissée ; terminée, on revient le lendemain.
import { h, ls, toast } from "../util.js";
import { Radar } from "../radar.js";
import { AdsbDb } from "../net.js";
import { QuizStore, Sightings, Player } from "../store.js";
import { Quiz, LEVELS, quizName, buildQuestion, MAX_PHOTO_KM, RARITIES, spottedRarity } from "../game.js";
import { Supa } from "../supa.js";
import { sync } from "../cloud.js";
import { go, renderHud } from "../app.js";
import { wikiQuery } from "../ui.js";
import { tipCard, markOptions, questionPhoto, quizPhoto, radiusButton, radiusNext, bonusBlock } from "../quizkit.js";
import { prefetchBonus } from "../wikiquiz.js";
import { Native } from "../native.js";

export const DAILY_MAX = 10;        // questions au plus
export const DAILY_PERFECT = 10;    // bonus si tout est juste (au moins 3 questions)
const KEY = "daily_quiz";

/** Date du jour sur le téléphone, AAAA-MM-JJ. */
export const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Partie du jour : { date, hexes, index, correct, points, done }, ou null si pas encore commencée. */
export const DailyStore = {
  get() { const s = ls.get(KEY, null); return s && s.date === todayKey() && s.owner === (Supa.userId || "") ? s : null; },
  save(s) { ls.set(KEY, { ...s, owner: Supa.userId || "" }); pushDailyQuiz(); },
};

/** Tous les avions passés près de vous aujourd'hui (un par code ICAO), les plus récents d'abord. */
const allToday = () => Sightings.history().filter((s) => dayOf(s.seenAt) === todayKey());
/** Rayon du quiz du jour = rayon de jeu du quiz en direct (selon le grade). */
export const dailyRadiusKm = () => Quiz.radiusKm(Player.level());
/** Avions passés aujourd'hui dans votre rayon de jeu (distance au plus près du passage). */
export const todaysSightings = () => { const r = dailyRadiusKm(); return allToday().filter((s) => (s.spotted.distanceKm ?? Infinity) <= r); };
/** Modèle d'un passage tel que le quiz le nomme (A319, A320 et A321 = « famille A320 ») : une question par modèle. */
const modelOf = (s) => quizName({ type: s.spotted.type, description: s.spotted.model, military: s.spotted.military }, null)
  || (s.spotted.type || s.spotted.model || s.spotted.hex).toUpperCase();
/** Un avion par modèle parmi les passages du jour dans le rayon de jeu (le plus proche de chaque modèle). */
export const dailyCandidates = () => {
  const best = new Map();
  for (const s of todaysSightings()) {
    const k = modelOf(s), b = best.get(k);
    if (!b || (s.spotted.distanceKm ?? 99) < (b.spotted.distanceKm ?? 99)) best.set(k, s);
  }
  return [...best.values()];
};
/** Nombre de questions du quiz du jour : un modèle différent par question, 10 au plus. */
export const dailyQuestionCount = () => Math.min(DAILY_MAX, dailyCandidates().length);
/** « à moins de 5 km », ou pour le radar infini « jusqu'à 30 km » (limite des passages notés par le radar). */
const radiusText = (r) => (Number.isFinite(r) ? `à moins de ${Quiz.kmLabel(r)}` : `radar infini, jusqu'à ${MAX_PHOTO_KM} km`);

// ---------- Appli Android : rappel du quiz du jour, chaque jour à 18 h ----------
const REMINDER_KEY = "daily_reminder";
const reminderOn = () => ls.get(REMINDER_KEY, true);
/** L'appli Android installée sait-elle faire le rappel ? (version 1.6 et plus) */
const nativeReminder = () => !!Native && typeof Native.setDailyQuiz === "function";

/**
 * Transmet à l'appli Android l'état du quiz du jour : avions du jour dans le rayon de jeu, partie commencée ou
 * finie, rappel activé. À 18 h, l'appli y ajoute les avions vus depuis par le radar d'arrière-plan et notifie.
 */
export function pushDailyQuiz() {
  if (!nativeReminder()) return;
  try {
    const st = DailyStore.get(), r = dailyRadiusKm();
    const all = todaysSightings();
    Native.setDailyQuiz(JSON.stringify({
      date: todayKey(), radiusKm: Number.isFinite(r) ? r : null,
      hexes: dailyCandidates().map((s) => s.spotted.hex),               // un avion par modèle (= questions possibles)
      all: all.map((s) => s.spotted.hex), types: [...new Set(all.map((s) => (s.spotted.type || "").toUpperCase()).filter(Boolean))],
      done: !!st?.done, started: !!st && !st.done, remaining: st && !st.done ? Math.max(0, st.hexes.length - st.index) : 0,
      enabled: reminderOn(),
    }));
  } catch { /* ancienne version de l'appli */ }
}
if (nativeReminder()) {
  setTimeout(pushDailyQuiz, 4000);
  setInterval(pushDailyQuiz, 10 * 60e3);                           // nouveaux passages notés par le radar du site
  window.addEventListener("planego-synced", pushDailyQuiz);        // grade à jour (rayon de jeu)
  window.addEventListener("planego-native-resume", () => setTimeout(pushDailyQuiz, 2000));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") pushDailyQuiz(); });
}
let onNotificationsChange = null;
window.addEventListener("planego-notifications", () => onNotificationsChange?.());

/** Règle du Quiz du jour (bouton « i » de l'onglet Jeux). */
export function dailyRules() {
  const lvl = Player.level();
  return [
    `Une question par modèle d'avion passé aujourd'hui dans ton rayon de jeu (le même que le quiz en direct, radar actif), jamais deux fois le même modèle, 10 au plus : les plus rares d'abord.`,
    `${Quiz.BASE_XP} XP par bonne réponse, +${DAILY_PERFECT} XP si tout est juste`
      + (Quiz.bonusCount(lvl) ? `, et ${Quiz.bonusLabel(lvl)} sur chaque avion (+${Quiz.BONUS_XP} XP chacune)` : "") + ".",
    "Une seule partie par jour : plus tu attends dans la journée, plus il y a d'avions ! Tes amis voient ton score dans le feed.",
    Native ? "Le rappel de 18 h te prévient avec le nombre d'avions de ton quiz." : "Avec l'appli Android, un rappel arrive chaque jour à 18 h avec le nombre d'avions de ton quiz.",
  ];
}

/** Interrupteur « Me rappeler le quiz chaque jour à 18 h » (appli Android). */
function reminderRow() {
  if (!Native) return null; // expliqué dans la règle du jeu (bouton « i »)
  if (!nativeReminder()) return h("div.small", { style: { marginTop: "8px", color: "var(--amber)" } }, "Mets à jour l'appli Android (lien « Télécharger » du site) pour recevoir le rappel du quiz chaque jour à 18 h.");
  const warn = h("div.small", { style: { color: "var(--amber)", display: "none" } },
    "Les notifications de Plane GO sont bloquées sur ce téléphone. ", h("button.btn.small.outline", { onclick: () => Native.askNotifications?.() }, "Autoriser"));
  const refresh = () => { warn.style.display = reminderOn() && Native.canNotify && !Native.canNotify() ? "" : "none"; };
  onNotificationsChange = refresh;
  const input = h("input", { type: "checkbox", checked: reminderOn(), onchange: (e) => {
    ls.set(REMINDER_KEY, e.target.checked); pushDailyQuiz();
    if (e.target.checked && Native.canNotify && !Native.canNotify()) Native.askNotifications?.();
    toast(e.target.checked ? "Rappel activé : chaque jour à 18 h" : "Rappel désactivé");
    refresh();
  } });
  refresh();
  return h("div", { style: { marginTop: "6px" } }, h("label.switch", h("span.small", "Me rappeler le quiz chaque jour à 18 h"), input), warn);
}

export function dailyQuiz(box) {
  let alive = true;
  const body = h("div");
  box.replaceChildren(body);

  async function render() {
    // Le rayon dépend du grade : à l'ouverture de l'appli, on attend le profil en ligne (XP du compte)
    if (Supa.isLoggedIn && !Player.profile) {
      body.replaceChildren(h("div.empty", "Chargement de ton quiz du jour…"));
      await sync();
      if (!alive) return;
    }
    const today = todayKey(), st = DailyStore.get(), seen = todaysSightings(), farther = allToday().length - seen.length;
    const lvl = Player.level(), next = LEVELS[lvl.number], r = dailyRadiusKm();
    const nextText = next ? ` Au grade ${next.name}, ton rayon passera à ${Quiz.radiusLabel(next)}.` : "";
    const dateText = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const intro = h("div.card.pad.week-intro",
      h("div", { style: { fontWeight: 800, color: "var(--amber)", fontSize: "17px" } }, "Quiz du jour"),
      h("div.small", `${dateText} · une seule partie par jour`),
      reminderRow());
    // Le rayon de jeu est porté par le bouton d'action (Commencer / Aller au Scanner), avec le rayon au grade suivant dessous
    const action = (label, sub, onClick) => h("div.mt", radiusButton({ km: r, lvl, label, sub, onClick }), radiusNext(lvl, next, Player.bestXp()));
    pushDailyQuiz();

    if (st?.done) {
      body.replaceChildren(intro, h("div.card.pad.mt", { style: { borderColor: "var(--green)" } },
        h("div", { style: { fontWeight: 800, color: "var(--green)", fontSize: "18px" } }, "Quiz du jour terminé"),
        h("div", `${st.correct} bonne(s) réponse(s) sur ${st.hexes.length} · +${st.points} XP`),
        st.bonus > 0 && h("div.small", `Questions bonus : +${st.bonus} XP`),
        Supa.isLoggedIn && h("div.small", { style: { marginTop: "6px" } }, "Ton résultat apparaît dans le feed de tes amis : ils peuvent le liker."),
        h("div.small.dim", { style: { marginTop: "6px" } }, "Reviens demain pour un nouveau quiz avec les avions de la journée.")));
      return;
    }
    // Déjà joué aujourd'hui sur un autre appareil ? (XP du quiz du jour enregistrés sur le compte)
    if (!st && Supa.isLoggedIn) {
      try {
        const done = await Supa.select(`quiz_awards?select=points&user_id=eq.${Supa.userId}&hex=like.${encodeURIComponent(`jour:${today}:`)}*&limit=50`);
        if (!alive) return;
        if (done.length) {
          const pts = done.reduce((t, a) => t + a.points, 0);
          DailyStore.save({ date: today, hexes: [], index: 0, correct: Math.round(pts / Quiz.BASE_XP), points: pts, done: true, other: true });
          body.replaceChildren(intro, h("div.card.pad.mt", { style: { borderColor: "var(--green)" } },
            h("div", { style: { fontWeight: 800, color: "var(--green)", fontSize: "18px" } }, "Quiz du jour déjà fait"),
            h("div", `Tu l'as fait sur un autre appareil aujourd'hui (+${pts} XP).`),
            h("div.small.dim", { style: { marginTop: "6px" } }, "Reviens demain pour un nouveau quiz.")));
          return;
        }
      } catch { /* hors ligne : on se fie au téléphone */ }
    }
    if (!st && !seen.length) {
      body.replaceChildren(intro, h("div.empty.daily-wait", farther
        ? `Aucun avion n'est encore passé ${radiusText(r)} de toi aujourd'hui.\n\n${farther} avion(s) sont passés plus loin, hors de ton rayon de jeu.${nextText}\n\nGarde le radar allumé dans l'onglet Scanner : chaque avion qui passe dans ton rayon s'ajoute à ton quiz du jour.`
        : `Aucun avion n'est encore passé au-dessus de toi aujourd'hui.\n\nLance le radar dans l'onglet Scanner : chaque avion qui passe ${radiusText(r)} s'ajoute à ton quiz du jour.`),
        action("Aller au Scanner", "Lance le radar", () => go("scanner")));
      return;
    }
    if (!st) {
      const models = dailyCandidates().length, n = Math.min(DAILY_MAX, models);
      body.replaceChildren(intro, h("div.card.pad.mt",
        h("div", { style: { fontWeight: 800 } }, `${seen.length} avion${seen.length > 1 ? "s" : ""} passé${seen.length > 1 ? "s" : ""} dans ton rayon de jeu aujourd'hui, `
          + `soit ${models} modèle${models > 1 ? "s" : ""} différent${models > 1 ? "s" : ""}`),
        h("div", { style: { marginTop: "4px" } }, `${n} question${n > 1 ? "s" : ""}, chacune sur un modèle d'avion différent`
          + (models > DAILY_MAX ? ` (${DAILY_MAX} modèles tirés au hasard parmi les ${models})` : "") + "."),
        farther > 0 && h("div.small.dim", `(${farther} autre(s) passé(s) plus loin, hors de ton rayon.${nextText})`),
        h("div.small.dim", "Une fois commencé, le quiz ne pourra plus être recommencé aujourd'hui.")),
        action("Commencer le quiz", `${n} question${n > 1 ? "s" : ""} · grade ${lvl.number}`, start));
      return;
    }
    play(st);
  }

  function start() {
    // Un avion par modèle ; les plus rares d'abord (légendaire → commun, au hasard à rareté égale) pour choisir les 10 questions,
    // puis ordre mélangé ; les modèles en trop (les moins rares) servent de réserve si une photo manque
    const rank = (x) => RARITIES.findIndex((r) => r.key === spottedRarity(x.spotted).key);
    const byRarity = dailyCandidates().map((x) => ({ x, k: rank(x) + Math.random() * 0.5 })).sort((p, q) => q.k - p.k).map((o) => o.x.spotted.hex);
    const chosen = byRarity.slice(0, DAILY_MAX).sort(() => Math.random() - 0.5);
    DailyStore.save({ date: todayKey(), hexes: chosen, spare: byRarity.slice(DAILY_MAX), index: 0, correct: 0, points: 0, done: false });
    render();
  }

  /** Question pour un avion vu aujourd'hui (nom connu + photo), ou null si impossible. */
  async function questionFor(hex) {
    const seen = Sightings.byHex(hex), s = seen?.spotted;
    if (!s) return null;
    const ac = { hex, type: s.type, description: s.model, military: s.military, category: s.category, distanceKm: s.distanceKm, altitudeFt: null };
    const info = Radar.extras.get(hex)?.info || (await AdsbDb.aircraft(hex).catch(() => null));
    const extra = { info };
    const name = quizName(ac, extra);
    if (!name) return null;
    const u = await questionPhoto(info?.photoUrl, wikiQuery.spotted(s), name);
    if (!u) return null;
    const q = buildQuestion(ac, extra, u);
    return q && { ...q, seenAt: seen.seenAt, wiki: wikiQuery.spotted(s) }; // wiki : article du modèle (questions bonus)
  }

  async function play(st) {
    if (st.index >= st.hexes.length) return finish(st);
    const total = st.hexes.length;
    body.replaceChildren(h("div.small.dim", `Question ${st.index + 1} / ${total} · ${st.correct} bonne(s) réponse(s)`),
      h("div.xpbar", h("i", { style: { width: `${(st.index / total) * 100}%` } })), h("div.empty", "Préparation de la question…"));
    const q = await questionFor(st.hexes[st.index]);
    if (!alive) return;
    if (!q) { // avion impossible à présenter (pas de nom ou de photo) : on passe, sans pénalité
      if (st.spare?.length) st.hexes[st.index] = st.spare.shift(); // un autre modèle à la place
      else st.hexes.splice(st.index, 1);
      DailyStore.save(st); return play(st);
    }
    const result = h("div.mt", { style: { fontWeight: 800, display: "none", whiteSpace: "pre-line" } });
    const tipBox = h("div"), bonusBox = h("div");
    const next = h("button.btn.primary.block.mt", { style: { display: "none" }, onclick: () => play(DailyStore.get() || st) },
      st.index + 1 < total ? "Question suivante " : "Voir mon score ");
    const nb = Quiz.bonusCount(Player.level());
    if (nb) prefetchBonus(q); // questions bonus prêtes quand le joueur aura répondu
    let answered = false;
    const opts = q.options.map((name) => h("button.opt", { onclick: () => answer(name) }, name));
    const photo = quizPhoto(q, ".mt");
    body.replaceChildren(
      h("div.small.dim", `Question ${st.index + 1} / ${total} · ${st.correct} bonne(s) réponse(s)`),
      h("div.xpbar", h("i", { style: { width: `${(st.index / total) * 100}%` } })),
      photo,
      h("p", ["Passé au-dessus de toi aujourd'hui" + (q.seenAt ? ` à ${hourOf(q.seenAt)}` : ""),
        q.distanceKm != null && `à ${q.distanceKm.toFixed(1).replace(".", ",")} km`].filter(Boolean).join(" · ")),
      h("h3", { style: { margin: "4px 0" } }, "Quel est cet avion ?"), ...opts, result, tipBox, bonusBox, next);

    function answer(choice) {
      if (answered) return;
      answered = true;
      const ok = choice === q.answer;
      markOptions(opts, q.answer, choice);
      const cur = DailyStore.get() || st;
      cur.index += 1;
      if (ok) {
        cur.correct += 1; cur.points += Quiz.BASE_XP;
        QuizStore.addAward(Quiz.BASE_XP, `jour:${cur.date}:${q.hex}`);
      }
      DailyStore.save(cur);
      result.style.display = ""; result.style.color = ok ? "var(--green)" : "var(--red)";
      result.textContent = ok ? `Bonne réponse ! +${Quiz.BASE_XP} XP` : `Raté : c'était « ${q.answer} ».`;
      if (!ok) tipBox.replaceChildren(tipCard(q, choice));
      photo.showFlag();
      next.style.display = "";
      // À partir du grade 4 : questions bonus sur ce modèle, comme dans le quiz en direct (XP à part du résultat du jour)
      if (nb) bonusBox.replaceChildren(bonusBlock(q, nb, { onAward: (pts, id) => {
        QuizStore.addAward(pts, `bonus:${q.hex}:${id}`);
        const c = DailyStore.get();
        if (c) { c.bonus = (c.bonus || 0) + pts; DailyStore.save(c); }
        renderHud();
        if (Supa.isLoggedIn) sync().then(renderHud);
      } }));
      renderHud();
      if (Supa.isLoggedIn) sync().then(renderHud);
    }
  }

  function finish(st) {
    if (!st.done) {
      st.done = true;
      if (st.hexes.length >= 3 && st.correct === st.hexes.length) {
        st.points += DAILY_PERFECT;
        QuizStore.addAward(DAILY_PERFECT, `jour:${st.date}:parfait`);
        toast(`Sans faute ! +${DAILY_PERFECT} XP de bonus`);
      }
      DailyStore.save(st);
      renderHud();
      if (Supa.isLoggedIn) sync().then(renderHud);
    }
    render();
  }

  render();
  return () => { alive = false; };
}

/** Heure de passage, « 14:32 ». */
const hourOf = (ms) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

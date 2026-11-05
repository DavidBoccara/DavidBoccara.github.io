// Onglet « Jeux » (ancien Quiz du ciel). Jeu « Sur la carte » : trois défis qui alternent (voir flyby.js).
// Les trois modes du quiz : « En direct » (l'avion qui passe dans votre rayon de jeu en ce moment),
// « Quiz du jour » (tous les avions passés au-dessus de vous aujourd'hui, une partie par jour, voir daily.js)
// et « Entraînement » (autant d'avions proches que l'on veut, sans points, voir practice.js).
import { h, meters, sleep } from "../util.js";
import { Radar } from "../radar.js";
import { Adsb } from "../net.js";
import { QuizStore, Player } from "../store.js";
import { Quiz, LEVELS } from "../game.js";
import { Supa } from "../supa.js";
import { sync } from "../cloud.js";
import { go, renderHud } from "../app.js";
import { locationBadge } from "../ui.js";
import { pickQuestion, tipCard, markOptions, quizPhoto, radiusButton, radiusNext, bonusBlock } from "../quizkit.js";
import { prefetchBonus } from "../wikiquiz.js";
import { dailyQuiz, DailyStore, dailyQuestionCount } from "./daily.js";
import { practiceQuiz } from "./practice.js";
import { flybyGame } from "./flyby.js";

const MODES = [
  { id: "live", label: "En direct" },
  { id: "daily", label: "Du jour" },
  { id: "practice", label: "Entraînement" },
  { id: "pass", label: "Sur la carte" },
];
const RUN = { live: liveQuiz, daily: dailyQuiz, practice: practiceQuiz, pass: flybyGame };

export function quiz(view, [sub]) {
  // Depuis la barre d'onglets (#quiz sans précision) : toujours le quiz « En direct », jamais l'entraînement
  let current = sub === "test" ? "practice" : sub === "dest" ? "pass" : MODES.some((m) => m.id === sub) ? sub : "live", stop = null;
  if (!RUN[current]) current = "live";
  const seg = h("div.seg.mt.quiz-seg");
  const body = h("div.mt");
  const title = h("h1.title");
  view.append(h("div.kicker", "Jeux"), title, seg, body);
  /** Onglets ; pastille du quiz du jour : fait (✅) ou nombre de questions (un modèle différent par question, 10 au plus). */
  function renderSeg() {
    const st = DailyStore.get();
    const count = st?.done ? 0 : st ? st.hexes.length - st.index : dailyQuestionCount();
    const badge = st?.done ? " " : count ? ` (${count})` : "";
    seg.replaceChildren(...MODES.map((m) => h("button" + (m.id === current ? ".on" : ""), { onclick: () => show(m.id) }, m.label + (m.id === "daily" ? badge : ""))));
  }
  function show(id) {
    stop?.(); stop = null;
    current = id;
    title.textContent = id === "pass" ? "Joue avec les avions autour de toi" : "Reconnais les avions";
    history.replaceState(null, "", "#quiz/" + id);
    renderSeg();
    body.replaceChildren();
    stop = RUN[id](body) || null;
  }
  show(current);
  // Le rayon de jeu (donc le nombre de questions) dépend du grade, connu une fois le profil en ligne chargé
  window.addEventListener("planego-synced", renderSeg);
  return () => { stop?.(); window.removeEventListener("planego-synced", renderSeg); };
}

/** Mode « En direct » : une question sur un avion qui passe dans votre rayon de jeu en ce moment. */
function liveQuiz(view) {
  let alive = true, answered = false, searchId = 0, busyText = null;
  const locBox = h("div", { style: { marginTop: "6px" } });
  const streak = h("div.grow", { style: { color: "var(--amber)", fontWeight: 800, fontSize: "18px" } });
  const mult = h("span.chip");
  const bar = h("div.xpbar", h("i"));
  const stats = h("div.small.dim", { style: { whiteSpace: "pre-line" } });
  const qBox = h("div.mt2", { style: { display: "none" } });
  // Recherche : le bouton porte le rayon de jeu (selon le grade), puis l'état de la recherche
  const hunt = h("div.hunt.mt2"), huntBtn = h("div"), huntNote = h("div.hunt-note"), huntExtra = h("div.hunt-extra");
  hunt.append(huntBtn, huntNote, huntExtra);
  view.append(locBox, h("div.row.mt", streak, mult), bar, stats, hunt, qBox);

  const showLoc = () => locBox.replaceChildren(Radar.location ? locationBadge(Radar.location) : "");
  const unsubLoc = Radar.subscribe(showLoc);

  function header() {
    showLoc();
    const lvl = Player.level(), next = LEVELS[lvl.number];
    const btn = radiusButton({ km: Quiz.radiusKm(lvl), lvl, label: "Chercher un avion", onClick: () => search() });
    btn.busy(busyText);
    huntBtn.replaceChildren(btn, radiusNext(lvl, next, Player.bestXp()));
    const s = QuizStore.stats(), m = Quiz.multiplier(s.streak + 1);
    streak.textContent = `Série : ${s.streak}`;
    mult.textContent = `×${m} · ${Quiz.BASE_XP * m} XP`;
    bar.firstChild.style.width = (m >= Quiz.MAX_MULT ? 100 : ((s.streak % 5) / 5) * 100) + "%";
    const toNext = 5 - (s.streak % 5);
    stats.textContent = `${s.correct} bonne(s) réponse(s) sur ${s.answered} · record : ${s.best} d'affilée · ${QuizStore.totalXp()} XP gagnés au quiz`
      + (m < Quiz.MAX_MULT ? `\nEncore ${toNext} bonne(s) réponse(s) pour passer à ×${Quiz.multiplier(s.streak + toNext)}` : "");
    renderHud();
  }

  /** État de la recherche : busy = texte du bouton pendant la recherche (null = cliquable) ; note et bouton en dessous. */
  function showHunt(busy, note = "", extra = null) {
    qBox.style.display = "none"; hunt.style.display = "";
    busyText = busy;
    huntBtn.querySelector(".radius-btn")?.busy(busy);
    huntNote.textContent = note; huntNote.style.display = note ? "" : "none";
    huntExtra.replaceChildren(...(extra ? [extra] : []));
  }

  async function search() {
    const id = ++searchId;
    answered = false;
    header();
    while (alive && id === searchId) {
      showHunt("Recherche de votre position…");
      const loc = await Radar.locate();
      if (!alive || id !== searchId) return;
      if (!loc) {
        showHunt(null, "Position inconnue. Autorisez la localisation (ou démarrez le radar dans l'onglet Scanner) : le quiz utilise votre position pour trouver les avions au-dessus de vous.",
          h("button.btn.outline", { onclick: () => go("scanner") }, "Aller au Scanner"));
        return;
      }
      const r = Quiz.radiusKm(Player.level());
      showHunt("Recherche en cours…");
      const q = await findQuestion(loc, r);
      if (!alive || id !== searchId) return;
      if (q) { QuizStore.ask(q); show(q); return; }
      showHunt(null, `Aucun nouvel avion ${Number.isFinite(r) ? `à moins de ${meters(r * 1000)}` : "à portée du radar"} pour l'instant. On cherche à nouveau toutes les 20 secondes : restez à l'affût !`,
        h("button.link-btn", { onclick: () => go("quiz/practice") }, "Jouer tout de suite en Entraînement (sans points)"));
      await sleep(20000);
    }
  }

  async function findQuestion(loc, r) {
    let list;
    try { list = await Adsb.around(loc.lat, loc.lon, r); } catch { return null; }
    return pickQuestion(list.filter((a) => !QuizStore.isSeen(a.hex)));
  }

  function show(q) {
    answered = false;
    ++searchId; // une question affichée arrête une recherche en cours
    hunt.style.display = "none"; qBox.style.display = "";
    const result = h("div.mt", { style: { fontWeight: 800, display: "none", whiteSpace: "pre-line" } });
    const lvl = Player.level();
    const next = radiusButton({ km: Quiz.radiusKm(lvl), lvl, label: "Avion suivant", sub: "Dans votre rayon de jeu", onClick: () => search() });
    next.style.display = "none"; next.classList.add("mt");
    const hint = [q.distanceKm > 30 ? "Repéré par votre radar" : "Au-dessus de vous", q.distanceKm != null && `à ${q.distanceKm.toFixed(1).replace(".", ",")} km`,
      q.altitudeM != null && `${q.altitudeM.toLocaleString("fr-FR")} m d'altitude`].filter(Boolean).join(" · ");
    const opts = q.options.map((name) => h("button.opt", { onclick: () => answer(name) }, name));
    const tipBox = h("div"), bonusBox = h("div");
    if (Quiz.bonusCount(Player.level())) prefetchBonus(q); // questions bonus prêtes quand le joueur aura répondu
    const photo = quizPhoto(q);
    qBox.replaceChildren(photo, h("p", hint),
      h("h3", { style: { margin: "4px 0" } }, "Quel est cet avion ?"), ...opts, result, tipBox, bonusBox, next);

    function answer(choice) {
      if (answered) return;
      const r = QuizStore.answer(choice, Quiz.multiplier, Quiz.BASE_XP);
      if (!r) return;
      answered = true;
      markOptions(opts, q.answer, choice);
      result.style.display = "";
      if (r.correct) {
        result.style.color = "var(--green)";
        result.textContent = `Bonne réponse ! +${r.points} XP${r.multiplier > 1 ? ` (×${r.multiplier})` : ""} · série de ${r.stats.streak}`
          + (r.stats.streak % 5 === 0 && r.stats.streak <= 5 * (Quiz.MAX_MULT - 1) ? `\nSérie de ${r.stats.streak} : les prochaines réponses rapportent ×${Quiz.multiplier(r.stats.streak + 1)} !` : "");
      } else {
        result.style.color = "var(--red)";
        result.textContent = `Raté : c'était « ${q.answer} ». La série repart de zéro.`;
        tipBox.replaceChildren(tipCard(q, choice));
      }
      photo.showFlag();
      next.style.display = "";
      // À partir du grade 4 : questions bonus sur ce modèle, d'après sa page Wikipédia (1 au grade 4, 2 au grade 5…)
      const nb = Quiz.bonusCount(Player.level());
      if (nb) bonusBox.replaceChildren(bonusBlock(q, nb, { onAward: (pts, id) => {
        QuizStore.addAward(pts, `bonus:${q.hex}:${id}`);
        header();
        if (Supa.isLoggedIn) sync().then(renderHud);
      } }));
      header();
      if (Supa.isLoggedIn) sync().then(renderHud);
    }
  }

  header();
  const cur = QuizStore.current();
  if (cur) show(cur); else search();
  return () => { alive = false; unsubLoc(); };
}

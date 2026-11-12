// Onglet « Jeux » (ancien Quiz du ciel). Jeu « Sur la carte » : trois défis qui alternent (voir flyby.js).
// Les trois modes du quiz : « En direct » (l'avion qui passe dans votre rayon de jeu en ce moment),
// « Quiz du jour » (tous les avions passés au-dessus de vous aujourd'hui, une partie par jour, voir daily.js)
// et « Entraînement » (autant d'avions proches que l'on veut, sans points, voir practice.js).
import { LOCALE, DEC } from "../i18n.js";
import { h, meters, sleep, icon, modal } from "../util.js";
import { Radar } from "../radar.js";
import { Adsb } from "../net.js";
import { QuizStore, Player } from "../store.js";
import { Quiz } from "../game.js";
import { Supa } from "../supa.js";
import { sync } from "../cloud.js";
import { go, renderHud } from "../app.js";
import { locationBadge, defaultLocationAlert } from "../ui.js";
import { pickQuestion, markOptions, quizPhoto, radiusButton, radiusNext, bonusBlock, questionTitle, answerNote, AIRLINE_RULE } from "../quizkit.js";
import { prefetchBonus } from "../wikiquiz.js";
import { dailyQuiz, DailyStore, dailyQuestionCount, dailyRules } from "./daily.js";
import { practiceQuiz, practiceRules } from "./practice.js";
import { flybyGame, flybyRules } from "./flyby.js";
import { dataSources } from "../credits.js";

// Les 4 jeux, présentés en cartes (nom, ce qu'on y fait, ce que ça rapporte) pour qu'on comprenne d'un coup d'œil
const MODES = [
  { id: "live", label: "Quiz en direct", icon: "plane", desc: "Devine le modèle ou la compagnie d'un avion qui passe près de toi", gain: "XP · série" },
  { id: "daily", label: "Quiz du jour", icon: "calendar", desc: "Les avions passés au-dessus de toi aujourd'hui", gain: "1 partie / jour" },
  { id: "pass", label: "Défis sur la carte", icon: "map", desc: "Qui va passer près de toi, où il va, qui vole le plus haut", gain: "XP · série" },
  { id: "practice", label: "Entraînement", icon: "refresh", desc: "Révise les modèles sans pression", gain: "Sans points" },
];
const RUN = { live: liveQuiz, daily: dailyQuiz, practice: practiceQuiz, pass: flybyGame };
// Règle de chaque jeu, affichée par le bouton « i » (au lieu de longs textes à l'écran)
const RULES = {
  live: () => [
    "Un avion passe dans ton rayon de jeu : trouve son modèle parmi 4 propositions.",
    AIRLINE_RULE,
    `Chaque bonne réponse rapporte des XP, et les réponses justes d'affilée multiplient les gains. Une erreur remet la série à zéro.`,
    "Ton rayon de jeu grandit avec ton grade (indiqué sur le bouton « Chercher un avion »).",
    Quiz.bonusCount(Player.level()) ? `Après chaque avion : ${Quiz.bonusLabel(Player.level())} sur le modèle (+${Quiz.BONUS_XP} XP chacune).` : "À partir du grade 4, des questions bonus sur le modèle rapportent des XP en plus.",
  ],
  daily: dailyRules, pass: flybyRules, practice: practiceRules,
};

export function quiz(view, [sub]) {
  // Depuis la barre d'onglets (#quiz sans précision) : toujours le quiz « En direct », jamais l'entraînement
  let current = sub === "test" ? "practice" : sub === "dest" ? "pass" : MODES.some((m) => m.id === sub) ? sub : "live", stop = null;
  if (!RUN[current]) current = "live";
  const seg = h("div.game-pick.mt", { role: "tablist" });
  const body = h("div.mt");
  const infoBtn = h("button.cam-btn", { type: "button", "aria-label": "Règle du jeu", title: "Règle du jeu",
    onclick: () => modal({ title: MODES.find((m) => m.id === current).label, body: RULES[current]() }) }, icon("info", 18));
  // Sources des positions sous chacun des jeux (ODbL d'adsb.lol : mention visible tout de suite + lien cliquable)
  view.append(h("div.scan-head", h("div.grow", h("div.kicker", "Jeux"), h("h1.title", "Choisis ton jeu")), h("div.scan-tools", infoBtn)), seg, body,
    h("div.mt", dataSources()));
  /** Onglets ; pastille du quiz du jour : fait (✅) ou nombre de questions (un modèle différent par question, 10 au plus). */
  function renderSeg() {
    const st = DailyStore.get();
    const count = st?.done ? 0 : st ? st.hexes.length - st.index : dailyQuestionCount();
    const dailyGain = st?.done ? "Fait aujourd'hui" : count ? `${count} question${count > 1 ? "s" : ""} aujourd'hui` : "1 partie / jour";
    seg.replaceChildren(...MODES.map((m) => h("button.game-card" + (m.id === current ? ".on" : ""),
      { role: "tab", "aria-selected": m.id === current ? "true" : "false", onclick: () => { if (m.id !== current) show(m.id); } },
      h("span.game-ic", icon(m.icon, 18)),
      h("span.game-txt", h("b", m.label), h("span.game-desc", m.desc),
        h("span.game-gain" + (m.id === "daily" && count && !st?.done ? ".hot" : ""), m.id === "daily" ? dailyGain : m.gain)))));
  }
  function show(id) {
    stop?.(); stop = null;
    current = id;
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
    const lvl = Player.level();
    const btn = radiusButton({ km: Quiz.radiusKm(lvl), lvl, label: "Chercher un avion", onClick: () => search() });
    btn.busy(busyText);
    huntBtn.replaceChildren(btn, radiusNext(Player.next()));
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
      // Dernière position connue tout de suite, comme « Le plus proche » du Scanner (relue en arrière-plan si elle a plus de 2 min)
      const loc = Radar.location || (await Radar.locate());
      Radar.locate();
      if (!alive || id !== searchId) return;
      if (!loc) {
        showHunt(null, "Position inconnue : le quiz utilise ta position pour trouver les avions au-dessus de toi.",
          h("button.btn.primary", { onclick: () => defaultLocationAlert() }, "Indiquer ma position"));
        defaultLocationAlert();
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
    // Un span par morceau : chacun est traduit à part (en anglais, la ligne entière restait en français)
    const hint = [q.distanceKm > 30 ? "Repéré par votre radar" : "Au-dessus de vous", q.distanceKm != null && `à ${q.distanceKm.toFixed(1).replace(".", DEC)} km`,
      q.altitudeM != null && `${q.altitudeM.toLocaleString(LOCALE)} m d'altitude`].filter(Boolean).flatMap((x, i) => (i ? [" · ", h("span", x)] : [h("span", x)]));
    const opts = q.options.map((name) => h("button.opt", { onclick: () => answer(name) }, name));
    const tipBox = h("div"), bonusBox = h("div");
    if (Quiz.bonusCount(Player.level())) prefetchBonus(q); // questions bonus prêtes quand le joueur aura répondu
    const photo = quizPhoto(q);
    qBox.replaceChildren(photo, h("p", ...hint),
      h("h3", { style: { margin: "4px 0" } }, questionTitle(q)), ...opts, result, tipBox, bonusBox, next);

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
      }
      tipBox.replaceChildren(answerNote(q, r.correct, choice));
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

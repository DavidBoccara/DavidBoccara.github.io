// Quiz › Entraînement : autant de questions que l'on veut sur les avions autour de soi en ce moment,
// quelle que soit la distance. Ne rapporte aucun point : série et statistiques du quiz ne bougent pas.
import { h } from "../util.js";
import { Radar } from "../radar.js";
import { Adsb } from "../net.js";
import { locationBadge } from "../ui.js";
import { Player } from "../store.js";
import { Quiz } from "../game.js";
import { pickQuestion, PracticeSeen, tipCard, markOptions, quizPhoto, bonusBlock } from "../quizkit.js";
import { prefetchBonus } from "../wikiquiz.js";

export function practiceQuiz(box) {
  let alive = true, searchId = 0, good = 0, total = 0;
  const locBox = h("div", { style: { marginTop: "6px" } });
  const score = h("div", { style: { fontWeight: 800, color: "var(--cyan)" } });
  const body = h("div.mt");
  box.replaceChildren(
    h("div.card.pad", { style: { borderColor: "var(--cyan)" } },
      h("div", { style: { fontWeight: 800, color: "var(--cyan)", fontSize: "17px" } }, "Entraînement"),
      h("div.small.dim", { style: { marginTop: "4px" } },
        "Autant d'avions que tu veux, pris autour de toi en ce moment, même loin : de quoi t'entraîner à les reconnaître"
        + (Quiz.bonusCount(Player.level()) ? `, avec ${Quiz.bonusLabel(Player.level())} sur chaque avion` : "") + ". Ne rapporte aucun point."),
      locBox, h("div.mt", score)),
    body);

  const showLoc = () => locBox.replaceChildren(Radar.location ? locationBadge(Radar.location) : "");
  const unsub = Radar.subscribe(showLoc);
  const showScore = () => { score.textContent = total ? `Cette session : ${good} bonne(s) réponse(s) sur ${total}` : "Cette session : aucune réponse pour l'instant"; };

  // Avions impossibles à présenter (pas de nom ou pas de photo) : on ne les réessaie pas pendant la séance
  const unusable = new Set();

  /**
   * Avion suivant, par ordre de préférence :
   * 1. un avion jamais proposé d'un modèle différent des 3 dernières questions, en cherchant à 25 km, puis 100, puis
   *    300 km (on élargit plutôt que de reproposer un avion déjà vu) ;
   * 2. sinon un avion jamais proposé, même d'un modèle récent ;
   * 3. en tout dernier recours, un avion déjà proposé (le plus ancien d'abord).
   */
  async function next() {
    const id = ++searchId;
    body.replaceChildren(h("div.empty", "Recherche d'un avion autour de toi…"));
    const loc = await Radar.locate();
    showLoc();
    if (!alive || id !== searchId) return;
    const order = PracticeSeen.order(), recent = PracticeSeen.recentAnswers(3), tried = new Set();
    const fail = (hex) => unusable.add(hex);
    let fallback = null, list = [];
    for (const r of [25, 100, 300]) {
      try { list = await Adsb.around(loc.lat, loc.lon, r); } catch { list = []; }
      if (!alive || id !== searchId) return;
      const fresh = list.filter((a) => !order.has(a.hex) && !unusable.has(a.hex) && !tried.has(a.hex)); // du plus proche au plus loin
      if (!fresh.length) continue;
      fresh.slice(0, 8).forEach((a) => tried.add(a.hex));
      const q = await pickQuestion(fresh, { avoid: recent, tries: 8, onFail: fail });
      if (!alive || id !== searchId) return;
      if (q && !recent.includes(q.answer)) return ask(q); // nouvel avion, nouveau modèle
      fallback ||= q;
    }
    if (fallback) return ask(fallback);
    // Plus aucun avion nouveau à 300 km : on reprend ceux déjà vus, du plus ancien au plus récent
    const rank = (a) => order.get(a.hex) ?? 0;
    const seen = list.filter((a) => order.has(a.hex) && !unusable.has(a.hex)).sort((a, b) => rank(a) - rank(b));
    const q = await pickQuestion(seen, { avoid: recent, tries: 8, onFail: fail });
    if (!alive || id !== searchId) return;
    if (q) return ask(q);
    body.replaceChildren(h("div.empty", "Aucun avion identifiable autour de toi pour l'instant. Réessaie dans un moment."),
      h("div", { style: { textAlign: "center" } }, h("button.btn.outline", { onclick: next }, "Réessayer")));
  }

  function ask(q) { PracticeSeen.add(q); show(q); }

  function show(q) {
    let answered = false;
    const result = h("div.mt", { style: { fontWeight: 800, display: "none" } });
    const tipBox = h("div"), bonusBox = h("div");
    const nextBtn = h("button.btn.primary.block.mt", { style: { display: "none" }, onclick: next }, "Avion suivant ");
    const nb = Quiz.bonusCount(Player.level());
    if (nb) prefetchBonus(q); // questions bonus prêtes quand le joueur aura répondu
    const hint = ["Autour de toi", q.distanceKm != null && `à ${q.distanceKm.toFixed(1).replace(".", ",")} km`,
      q.altitudeM != null && `${q.altitudeM.toLocaleString("fr-FR")} m d'altitude`].filter(Boolean).join(" · ");
    const opts = q.options.map((name) => h("button.opt", { onclick: () => answer(name) }, name));
    const photo = quizPhoto(q);
    body.replaceChildren(photo, h("p", hint),
      h("h3", { style: { margin: "4px 0" } }, "Quel est cet avion ?"), ...opts, result, tipBox, bonusBox, nextBtn);

    function answer(choice) {
      if (answered) return;
      answered = true;
      const ok = choice === q.answer;
      markOptions(opts, q.answer, choice);
      total += 1; if (ok) good += 1;
      showScore();
      result.style.display = ""; result.style.color = ok ? "var(--green)" : "var(--red)";
      result.textContent = ok ? "Bonne réponse !" : `Raté : c'était « ${q.answer} ».`;
      if (!ok) tipBox.replaceChildren(tipCard(q, choice));
      photo.showFlag();
      nextBtn.style.display = "";
      // À partir du grade 4 : questions bonus sur ce modèle, comme dans le quiz en direct, mais sans points
      if (nb) bonusBox.replaceChildren(bonusBlock(q, nb, { xp: false }));
    }
  }

  showScore();
  next();
  return () => { alive = false; unsub(); };
}

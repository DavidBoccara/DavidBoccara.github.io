// Vue « Passés au-dessus » de l'onglet Collection (ex-onglet Hangar) : les avions passés cette semaine.
// La liste repart à zéro le lundi à 0 h (heure de Paris), avec le concours photo ; les photos attrapées restent dans la vue Photos.
import { h, ls, dateTime, dateDay, weekStart, icon, rarityMark, infoButton } from "../util.js";
import { Collection, Sightings, entryPhoto, entryRarity, entryModel, entryLabel } from "../store.js";
import { computeXp, spottedRarity, flagOf, prettyModel, MAX_PHOTO_KM } from "../game.js";
import { askPhotoSource, showEntry, showWiki, wikiDot, wikiImg, wikiQuery } from "../ui.js";

/**
 * Affiche la liste des avions passés au-dessus de vous dans `box` (mode « seen »).
 * onChange est appelé quand une photo est ajoutée ou supprimée.
 */
// Jour d'un passage (heure du téléphone) : « AAAA-MM-JJ », et son nom court (« Ven. 6 ») ou long (« Aujourd'hui », « Vendredi 6 novembre »)
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const SHORT = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" });
const LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
function dayLabel(key, long = false) {
  const [y, m, d] = key.split("-").map(Number), date = new Date(y, m - 1, d);
  const today = dayKey(Date.now()), yesterday = dayKey(Date.now() - 864e5);
  if (key === today) return "Aujourd'hui";
  if (key === yesterday) return "Hier";
  const t = (long ? LONG : SHORT).format(date);
  return t[0].toUpperCase() + t.slice(1);
}

export function hangarList(box, mode, onChange) {
  let byRarity = ls.get("hangar_sort_rarity", false);
  const summary = h("div.grow", { style: { color: "var(--cyan)", fontWeight: 700 } });
  const hint = h("div.row", { style: { alignItems: "flex-start" } }, summary, infoButton("Avions passés au-dessus", [
    `Les avions passés cette semaine à moins de ${MAX_PHOTO_KM} km pendant que le radar tournait.`,
    "Touche un avion pour ajouter ta photo (déjà attrapé : d'autres photos pour son album), ou sa photo Wikipédia pour sa fiche.",
    "Jour : n'affiche que les avions d'un jour. Plus rares : les plus rares en premier.",
    "La liste repart à zéro lundi à 0 h, avec le concours photo : ajoute tes photos avant !",
  ], { small: true }));
  const sortSeg = h("div.seg.grow");
  const sortRow = h("div.row.mt", h("span.small", { style: { fontWeight: 700 } }, "Trier :"), sortSeg);
  // Choix du jour : toute la semaine ou un seul jour (jours où des avions sont passés, avec leur nombre)
  let day = ls.get("hangar_day", "all");
  const daySeg = h("div.seg.grow.day-seg");
  const dayRow = h("div.row", h("span.small", { style: { fontWeight: 700 } }, "Jour :"), daySeg);
  const empty = h("div.empty", `Aucun avion n'est encore passé à moins de ${MAX_PHOTO_KM} km de toi cette semaine.

Lance le radar dans l'onglet Scanner : les avions qui passent près de toi apparaîtront ici.`);
  const list = h("div.list.mt");
  box.replaceChildren(hint, sortRow, dayRow, empty, list);

  const changed = () => { render(); onChange?.(); };
  const bestOf = (l) => l.reduce((b, e) => (!b || e.xp > b.xp || (e.xp === b.xp && e.takenAt > b.takenAt) ? e : b), null);

  function seenRows() {
    const byHex = new Map();
    for (const e of Collection.all()) byHex.set(e.hex, bestOf([byHex.get(e.hex), e].filter(Boolean)));
    const hist = Sightings.history(), rows = [];
    for (const s of hist) {
      const sp = s.spotted, e = byHex.get(sp.hex);
      const model = prettyModel(sp.model || sp.type), ident = sp.callsign || sp.registration || sp.hex.toUpperCase();
      const xpValue = e ? e.xp : computeXp(sp, { hasModel: Collection.hasModel, countForHex: Collection.countForHex }).total;
      rows.push({
        title: (sp.countryIso.length === 2 ? flagOf(sp.countryIso) + " " : "") + (model || ident),
        sub: [model ? ident + " · " : "", dateTime(s.seenAt), sp.distanceKm != null ? ` · ${sp.distanceKm.toFixed(1).replace(".", ",")} km` : "",
          sp.military ? "\nMilitaire" : ""].join(""),
        rarity: e ? entryRarity(e) : spottedRarity(sp), xpText: e ? `+${xpValue} XP` : `${xpValue} XP`, xpValue, at: s.seenAt, entry: e,
        wiki: wikiQuery.spotted(sp),
        onClick: () => (e ? showEntry(e, { onChange: changed }) : askPhotoSource(s).then(changed)),
      });
    }
    // Avions attrapés cette semaine sans passage enregistré (photo prise depuis la fiche d'un avion plus lointain)
    const inHist = new Set(hist.map((s) => s.spotted.hex)), since = weekStart();
    for (const e of [...byHex.values()].filter((x) => !inHist.has(x.hex) && x.takenAt >= since)) {
      rows.push({ title: (e.countryIso.length === 2 ? flagOf(e.countryIso) + " " : "") + (entryModel(e) || entryLabel(e)),
        sub: `${entryLabel(e)} · photographié le ${dateDay(e.takenAt)}`, rarity: entryRarity(e), xpText: `+${e.xp} XP`, xpValue: e.xp,
        at: e.takenAt, entry: e, wiki: wikiQuery.entry(e), onClick: () => showEntry(e, { onChange: changed }) });
    }
    rows.sort(byRarity ? (a, b) => b.rarity.ordinal - a.rarity.ordinal || b.xpValue - a.xpValue || b.at - a.at : (a, b) => b.at - a.at);
    for (const r of rows) r.day = dayKey(r.at);
    return rows;
  }

  /** Résumé de la liste affichée (semaine entière ou jour choisi). */
  function summarize(rows) {
    const xp = rows.reduce((t, r) => t + (r.entry?.xp || 0), 0);
    const when = day === "all" ? "cette semaine" : dayLabel(day, true).toLowerCase();
    summary.textContent = `${rows.length} avion(s) passé(s) au-dessus de vous ${when} · ${rows.filter((r) => r.entry).length} attrapé(s) · ${xp} XP`;
  }

  function row(r) {
    const ph = h("div.ph", icon("plane", 34));
    if (r.entry) {
      const img = h("img", { alt: "Ma photo de l'avion", loading: "lazy" });
      entryPhoto(r.entry).then((u) => { if (u) img.src = u; });
      ph.append(img, h("div.band.caught", "ATTRAPÉ"), wikiDot(r.wiki));
    } else {
      const img = h("img", { alt: "Photo Wikipédia du modèle", loading: "lazy", style: { display: "none" } });
      wikiImg(img, r.wiki, (ok) => { if (ok) img.style.display = ""; });
      ph.append(img, h("div.band.wiki", "Wikipédia"));
      ph.addEventListener("click", (e) => { e.stopPropagation(); showWiki(r.wiki); });
    }
    return h("div.card.hrow", { onclick: r.onClick }, ph,
      h("div.info", h("div.nm", r.title), h("div.sub", { style: { whiteSpace: "pre-line" } }, r.sub),
        h("div.row", { style: { marginTop: "6px" } }, h("span.grow.small", rarityMark(r.rarity)),
          h("span.chip.small", r.xpText))));
  }

  const PAGE = 50;
  function render() {
    sortSeg.replaceChildren(
      h("button" + (!byRarity ? ".on" : ""), { onclick: () => { byRarity = false; ls.set("hangar_sort_rarity", false); render(); } }, "Plus récents"),
      h("button" + (byRarity ? ".on" : ""), { onclick: () => { byRarity = true; ls.set("hangar_sort_rarity", true); render(); } }, "★ Plus rares"));
    const all = seenRows();
    // Jours de la semaine où des avions sont passés, du plus récent au plus ancien
    const days = [...new Set(all.map((r) => r.day))].sort().reverse();
    if (day !== "all" && !days.includes(day)) day = "all"; // jour d'une autre semaine ou sans avion
    const pick = (d) => { day = d; ls.set("hangar_day", d); render(); };
    daySeg.replaceChildren(
      h("button" + (day === "all" ? ".on" : ""), { onclick: () => pick("all") }, "Semaine"),
      ...days.map((d) => h("button" + (day === d ? ".on" : ""), { onclick: () => pick(d) },
        `${dayLabel(d)} (${all.filter((r) => r.day === d).length})`)));
    dayRow.style.display = days.length > 1 ? "" : "none";
    const rows = day === "all" ? all : all.filter((r) => r.day === day);
    summarize(rows);
    empty.style.display = rows.length ? "none" : "";
    // Plus récents sur toute la semaine : un titre par jour dans la liste
    const headers = day === "all" && !byRarity;
    let lastDay = null;
    // Par pages de 50 (1 300 avions en une fois = 28 000 éléments à l'écran et des centaines de photos à charger)
    let shown = 0;
    const more = h("button.btn.block.mt", { onclick: () => page() });
    const page = () => {
      const next = rows.slice(shown, shown + PAGE);
      shown += next.length;
      for (const r of next) {
        if (headers && r.day !== lastDay) { lastDay = r.day; more.before(h("div.kicker.day-head", dayLabel(r.day, true))); }
        more.before(row(r));
      }
      more.textContent = `Afficher plus (${rows.length - shown} autres)`;
      more.style.display = shown < rows.length ? "" : "none";
    };
    list.replaceChildren(more);
    page();
  }
  render();
}

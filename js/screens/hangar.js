// Vue « Passés au-dessus » de l'onglet Collection (ex-onglet Hangar) : les avions passés cette semaine.
// La liste repart à zéro le lundi à 0 h (heure de Paris), avec le concours photo ; les photos attrapées restent dans la vue Photos.
import { h, ls, dateTime, dateDay, weekStart, icon, rarityMark } from "../util.js";
import { Collection, Sightings, entryPhoto, entryRarity, entryModel, entryLabel } from "../store.js";
import { computeXp, spottedRarity, flagOf, prettyModel, MAX_PHOTO_KM } from "../game.js";
import { askPhotoSource, showEntry, showWiki, wikiDot, wikiImg, wikiQuery } from "../ui.js";

/**
 * Affiche la liste des avions passés au-dessus de vous dans `box` (mode « seen »).
 * onChange est appelé quand une photo est ajoutée ou supprimée.
 */
export function hangarList(box, mode, onChange) {
  let byRarity = ls.get("hangar_sort_rarity", false);
  const summary = h("div", { style: { color: "var(--cyan)", fontWeight: 700 } });
  const hint = h("div.small.dim");
  const sortSeg = h("div.seg.grow");
  const sortRow = h("div.row.mt", h("span.small", { style: { fontWeight: 700 } }, "Trier :"), sortSeg);
  const empty = h("div.empty", `Aucun avion n'est encore passé à moins de ${MAX_PHOTO_KM} km de vous cette semaine.\n\nLancez le radar (onglet Scanner) pendant vos sessions de spotting : chaque avion qui passe au-dessus de vous apparaîtra ici. La liste repart à zéro chaque lundi à 0 h, en même temps que le concours photo de la semaine.`);
  const list = h("div.list.mt");
  box.replaceChildren(summary, hint, sortRow, empty, list);

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
    const xp = rows.reduce((t, r) => t + (r.entry?.xp || 0), 0);
    summary.textContent = `${rows.length} avion(s) passé(s) au-dessus de vous cette semaine · ${rows.filter((r) => r.entry).length} attrapé(s) · ${xp} XP`;
    hint.textContent = `Avions passés cette semaine à moins de ${MAX_PHOTO_KM} km pendant que le radar tournait. Touchez un avion pour ajouter votre photo (déjà attrapé : d'autres photos pour son album), ou sa photo Wikipédia pour sa fiche. La liste repart à zéro lundi à 0 h, avec le concours photo : ajoutez vos photos avant !`;
    return rows;
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

  function render() {
    sortSeg.replaceChildren(
      h("button" + (!byRarity ? ".on" : ""), { onclick: () => { byRarity = false; ls.set("hangar_sort_rarity", false); render(); } }, "Plus récents"),
      h("button" + (byRarity ? ".on" : ""), { onclick: () => { byRarity = true; ls.set("hangar_sort_rarity", true); render(); } }, "★ Plus rares"));
    const rows = seenRows();
    empty.style.display = rows.length ? "none" : "";
    list.replaceChildren(...rows.map(row));
  }
  render();
}

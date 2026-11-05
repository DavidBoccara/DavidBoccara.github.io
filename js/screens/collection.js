// Onglet Collection : grade et XP, puis trois vues — mes photos, avions passés au-dessus, catalogue complet.
import { h, ls, rarityMark } from "../util.js";
import { Collection, Player, entryPhoto, entryPhotoItems, entryRarity, entryModel, entryLabel } from "../store.js";
import { Supa } from "../supa.js";
import { sync } from "../cloud.js";
import { RARITIES, flagOf, modelKey } from "../game.js";
import { importFlow, showEntry, wikiDot, wikiQuery, albumBadge } from "../ui.js";
import { go, renderHud } from "../app.js";
import { hangarList } from "./hangar.js";
import { catalogView } from "./catalog.js";

const VIEWS = [
  { id: "photos", label: "Photos" },
  { id: "seen", label: "Au-dessus" },
  { id: "catalog", label: "Catalogue" },
];

export function collection(view, [sub]) {
  const renamed = (v) => (v === "famous" ? "catalog" : v); // ancienne vue « Célèbres », intégrée au catalogue
  let current = VIEWS.some((v) => v.id === renamed(sub)) ? renamed(sub) : renamed(ls.get("collection_view", "photos"));
  if (!VIEWS.some((v) => v.id === current)) current = "photos";
  const level = h("h2", { style: { margin: 0, fontSize: "20px" } });
  const bar = h("div.xpbar.cyan", h("i"));
  const xpText = h("div.small", { style: { fontWeight: 700 } });
  const syncText = h("div.small.dim");
  const seg = h("div.seg.mt");
  const body = h("div.mt");
  view.append(
    h("div.kicker", "Collection"),
    h("div.row", h("div.grow", level), h("button.btn.small.outline", { onclick: () => { ls.set("grades_mode", "grades"); go("profile/ranking"); } }, "Grades")),
    bar, xpText, syncText,
    h("button.btn.primary.block.mt", { onclick: async () => { await importFlow(); refresh(); } }, "Ajouter une photo d'appareil photo"),
    seg, body);

  function header() {
    const xp = Player.bestXp(), lvl = Player.level();
    level.textContent = `Niveau ${lvl.number} — ${lvl.title}`;
    bar.firstChild.style.width = (lvl.nextXp ? ((xp - lvl.minXp) / (lvl.nextXp - lvl.minXp)) * 100 : 100) + "%";
    xpText.textContent = lvl.nextXp ? `${xp.toLocaleString("fr-FR")} XP • grade suivant à ${lvl.nextXp.toLocaleString("fr-FR")} XP` : `${xp.toLocaleString("fr-FR")} XP • grade maximum !`;
    renderHud();
  }

  function show(id) {
    current = id;
    ls.set("collection_view", id);
    history.replaceState(null, "", "#collection/" + id);
    seg.replaceChildren(...VIEWS.map((v) => h("button" + (v.id === id ? ".on" : ""), { onclick: () => show(v.id) }, v.label)));
    if (id === "photos") photos(); else if (id === "catalog") catalogView(body, refresh); else hangarList(body, id, refresh);
  }

  function refresh() { header(); show(current); }

  function photos() {
    const entries = Collection.all();
    const models = new Set(entries.map(modelKey).filter(Boolean)).size;
    const mil = new Set(entries.filter((e) => e.military).map((e) => e.hex)).size;
    const byR = [...RARITIES].reverse().map((r) => [r, entries.filter((e) => e.rarity === r.key).length]).filter(([, n]) => n).map(([r, n]) => `${r.label} : ${n}`);
    const photos = entries.reduce((s, e) => s + entryPhotoItems(e).length, 0);
    const stats = `${photos} photo(s) • ${new Set(entries.map((e) => e.hex)).size} avion(s) • ${models} modèle(s) • ${mil} militaire(s)` + (byR.length ? "\n" + byR.join(" • ") : "");
    body.replaceChildren(
      h("div.small.dim", { style: { whiteSpace: "pre-line" } }, stats),
      entries.length ? h("div.grid.mt", entries.map(tile))
        : h("div.empty", "Votre collection est vide.\n\nOuvrez la fiche d'un avion qui passe au-dessus de vous (onglet Scanner) et touchez « Photographier cet avion » pour commencer à gagner des XP.\n\nPhoto prise au reflex ? Touchez « Ajouter une photo d'appareil photo » et choisissez l'avion parmi ceux passés près de vous."));
  }

  function tile(e) {
    const r = entryRarity(e), img = h("img", { alt: "", loading: "lazy" });
    entryPhoto(e).then((u) => { if (u) img.src = u; });
    return h("div.card.tile", { onclick: () => showEntry(e, { onChange: refresh }) },
      h("div.ph", img, albumBadge(e), wikiDot(wikiQuery.entry(e))),
      h("div.strip", { style: { background: r.color } }),
      h("div.nm", (e.countryIso.length === 2 ? flagOf(e.countryIso) + " " : "") + (entryModel(e) || entryLabel(e))),
      h("div.rr", rarityMark(r, `${r.label} · ${e.rejected ? "non validée" : e.xp + " XP"}`)));
  }

  async function doSync() {
    if (!Supa.isLoggedIn) { syncText.textContent = "Connectez-vous (onglet Profil) pour sauvegarder vos photos sur votre compte."; return; }
    syncText.textContent = "Synchronisation…";
    const err = await sync();
    syncText.textContent = err ? `Synchronisation impossible : ${err}` : "Collection sauvegardée sur votre compte.";
    refresh();
  }

  header(); show(current); doSync();
}

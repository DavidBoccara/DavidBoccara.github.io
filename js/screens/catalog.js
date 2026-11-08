// Vue « Catalogue » de l'onglet Collection : tous les modèles d'avions du jeu, classés par thème,
// rareté ou marque, avec les XP à gagner, le lien Wikipédia et la mention ✅ quand on l'a attrapé.
// Fiche d'un modèle : « Ajouter une photo ancienne » (addOldPhoto d'ui.js : sans vérification ni XP, jamais au concours ;
// le modèle ne compte pas comme attrapé, il est seulement marqué « photo ancienne »).
import { h, ls, modal, choose, dateDay, dateTime, icon, rarityMark, infoButton } from "../util.js";
import { Collection, Sightings, entryPhoto, isOld } from "../store.js";
import { CATALOG, THEMES, RARITIES, catalogMatches, wikiLink, MAX_PHOTO_KM } from "../game.js";
import { askPhotoSource, showEntry, wikiImg, photoStrip, addOldPhoto } from "../ui.js";

const GROUPINGS = [
  { id: "theme", label: "Thème" },
  { id: "rarity", label: "Rareté" },
  { id: "maker", label: "Marque" },
];
const THEME_BY_KEY = Object.fromEntries(THEMES.map(([k, emoji, label]) => [k, { emoji, label }]));
const wikiQ = (c) => ({ type: c.codes[0], model: c.wiki, military: c.military, title: c.name });
const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function catalogView(box, onChange) {
  let grouping = ls.get("catalog_group", "theme");
  let onlyFamous = false, onlyCaught = false, query = "";
  const open = new Set(ls.get("catalog_open", []));

  const summary = h("div.grow", { style: { color: "var(--cyan)", fontWeight: 700 } });
  const bar = h("div.xpbar.cyan", { style: { marginTop: "6px" } }, h("i"));
  const search = h("input.cat-search", { type: "search", placeholder: "Avion, marque ou code (A320, Rafale…)",
    oninput: (e) => { query = e.target.value; render(); } });
  const seg = h("div.seg.grow");
  const chips = h("div.cat-chips");
  const groups = h("div.mt");
  box.replaceChildren(h("div.row", summary, infoButton("Catalogue", [
      "Tous les modèles du jeu et les XP qu'ils rapportent.",
      "Touche un avion pour sa fiche, « Wikipédia » pour l'article. Un cadenas : pas encore attrapé.",
      "Une photo d'avant Plane GO ? Dans la fiche du modèle, touche « Ajouter une photo ancienne » : elle rejoint ta collection et le feed avec la mention « Photo ancienne », sans vérification, sans XP et sans compter comme attrapé.",
    ], { small: true })), bar,
    search, h("div.row.mt", h("span.small", { style: { fontWeight: 700 } }, "Classer par :"), seg), chips, groups);

  // Photos de la collection correspondant à chaque modèle (la meilleure en XP) ; les photos anciennes à part
  // (elles ne comptent pas comme « attrapé » : seulement la vignette et la mention « photo ancienne »)
  function caughtMap() {
    const entries = Collection.all().filter((e) => !e.rejected && !isOld(e)), map = new Map();
    for (const c of CATALOG) {
      const mine = entries.filter((e) => catalogMatches(c, e.type, e.military));
      if (mine.length) map.set(c.id, mine.reduce((b, e) => (e.xp > b.xp ? e : b)));
    }
    return map;
  }
  function oldMap() {
    const entries = Collection.all().filter(isOld), map = new Map(); // les plus récentes d'abord
    for (const c of CATALOG) {
      const old = entries.find((e) => catalogMatches(c, e.type, e.military));
      if (old) map.set(c.id, old);
    }
    return map;
  }

  function groupsOf(list) {
    if (grouping === "rarity") {
      return [...RARITIES].reverse().map((r) => ({ key: "r" + r.key, title: rarityMark(r, `${r.label} · ${r.xp} XP`),
        items: list.filter((c) => c.rarity.key === r.key) }));
    }
    if (grouping === "maker") {
      const makers = [...new Set(list.map((c) => c.maker))].sort((a, b) => a.localeCompare(b, "fr"));
      return makers.map((m) => ({ key: "m" + m, title: m, items: list.filter((c) => c.maker === m) }));
    }
    return THEMES.map(([k]) => ({ key: "t" + k, title: THEME_BY_KEY[k].label, items: list.filter((c) => c.theme === k) }));
  }

  function render() {
    io?.disconnect();
    ls.set("catalog_group", grouping);
    seg.replaceChildren(...GROUPINGS.map((g) => h("button" + (g.id === grouping ? ".on" : ""), { onclick: () => { grouping = g.id; render(); } }, g.label)));
    chips.replaceChildren(
      h("button.cat-chip" + (onlyFamous ? ".on" : ""), { onclick: () => { onlyFamous = !onlyFamous; render(); } }, "Célèbres"),
      h("button.cat-chip" + (onlyCaught ? ".on" : ""), { onclick: () => { onlyCaught = !onlyCaught; render(); } }, "Attrapés"));

    const caught = caughtMap(), olds = oldMap();
    summary.textContent = `${CATALOG.length} modèles · ${caught.size} attrapé(s)`;
    bar.firstChild.style.width = (caught.size / CATALOG.length) * 100 + "%";

    const q = norm(query.trim());
    const list = CATALOG.filter((c) => (!onlyFamous || c.famous) && (!onlyCaught || caught.has(c.id))
      && (!q || norm(`${c.name} ${c.maker} ${c.codes.join(" ")} ${c.famous?.nickname || ""}`).includes(q)))
      .sort((a, b) => (grouping === "rarity" ? 0 : b.rarity.ordinal - a.rarity.ordinal) || a.name.localeCompare(b.name, "fr"));
    const forced = !!q || onlyFamous || onlyCaught; // recherche ou filtre : tout est déplié

    groups.replaceChildren(...groupsOf(list).filter((g) => g.items.length).map((g) => {
      const got = g.items.filter((c) => caught.has(c.id)).length;
      const body = h("div.list.cat-body");
      const det = h("details.cat-group", { open: forced || open.has(g.key) },
        h("summary", h("span.grow", { style: g.color ? { color: g.color } : null }, g.title),
          h("span.small.dim", `${g.items.length}${got ? ` · ${got}` : ""}`)), body);
      // Les lignes ne sont créées qu'à l'ouverture du groupe
      const fill = () => { if (!body.childElementCount) body.append(...g.items.map((c) => row(c, caught.get(c.id), olds.get(c.id)))); };
      if (det.open) fill();
      det.addEventListener("toggle", () => {
        if (det.open) { fill(); open.add(g.key); } else open.delete(g.key);
        if (!forced) ls.set("catalog_open", [...open]);
      });
      return det;
    }));
    if (!list.length) groups.append(h("div.empty", "Aucun avion ne correspond."));
  }

  // Photo chargée seulement quand la ligne apparaît à l'écran (évite des centaines d'appels à Wikipédia)
  const io = "IntersectionObserver" in window ? new IntersectionObserver((items) => {
    for (const it of items) if (it.isIntersecting) { io.unobserve(it.target); it.target._load?.(); }
  }, { rootMargin: "200px" }) : null;

  function row(c, mine, old) {
    const ph = h("div.cat-ph", icon("plane", 24));
    const img = h("img", { alt: "", loading: "lazy", style: { display: "none" } });
    ph.append(img);
    // On observe le cadre (l'image cachée n'a pas de taille, elle ne serait jamais « visible »)
    ph._load = () => {
      if (mine || old) entryPhoto(mine || old).then((u) => { if (u) { img.src = u; img.style.display = ""; } });
      else wikiImg(img, wikiQ(c), (ok) => { if (ok) img.style.display = ""; });
    };
    if (io) io.observe(ph); else ph._load();
    const r = c.rarity;
    return h("div.card.cat-row" + (mine ? "" : ".todo") + (!mine && old ? ".has-old" : ""), { style: { borderColor: mine ? "var(--green)" : "" }, onclick: () => details(c, mine) },
      ph,
      h("div.cat-info",
        h("div.nm", h("span", { title: mine ? "Attrapé" : "Pas encore attrapé" }, mine ? "✓ " : ""), c.name),
        h("div.sub", [c.maker, c.codes.join(" · ")].join(" — ")),
        c.famous && h("div.sub", { style: { color: "var(--amber)" } }, `« ${c.famous.nickname} »`),
        old && h("div.sub.old-sub", icon("image", 12), "Photo ancienne"),
        h("div.row", { style: { marginTop: "4px", gap: "6px" } },
          h("span.small", rarityMark(r, "")),
          h("span.chip.small", mine ? `+${mine.xp} XP` : `${c.baseXp} XP`),
          h("span.grow"),
          h("a.cat-wiki", { href: wikiLink(c.wiki), target: "_blank", rel: "noopener", onclick: (e) => e.stopPropagation() }, "Wikipédia "))));
  }

  function details(c, mine) {
    const img = h("img.cover", { alt: "Photo Wikipédia du modèle", style: { display: "none", borderRadius: "12px", maxHeight: "200px" } });
    wikiImg(img, wikiQ(c), (ok) => { if (ok) img.style.display = ""; });
    const t = THEME_BY_KEY[c.theme], r = c.rarity;
    const recent = Sightings.recent().filter((s) => catalogMatches(c, s.spotted.type, s.spotted.military) && !Collection.hexes().has(s.spotted.hex));
    const lines = [
      `${r.stars} ${r.label}`,
      `XP : ${c.baseXp} de base, jusqu'à ${c.maxXp} (vol de plus de 6 000 km et premier de ce modèle)`,
      `Constructeur : ${c.maker}`,
      `Catégorie : ${t.label}`,
      `Codes de type : ${c.codes.join(", ")}`,
      c.famous && `\n« ${c.famous.nickname} » — ${c.famous.description}`,
      "",
      mine ? `Attrapé le ${dateDay(mine.takenAt)} (+${mine.xp} XP)`
        + (recent.length ? `\nUn autre ${c.name} est passé près de vous le ${dateTime(recent[0].seenAt)} : il peut aussi être attrapé !` : "")
        : recent.length ? `Passé près de vous le ${dateTime(recent[0].seenAt)} : ajoutez votre photo !`
        : `Pas encore attrapé. Dès qu'il passera à moins de ${MAX_PHOTO_KM} km avec le radar actif, vous pourrez le photographier.`,
    ].filter((x) => x !== false && x != null);
    const buttons = [{ label: "Wikipédia ", onClick: () => { window.open(wikiLink(c.wiki), "_blank", "noopener"); return false; } }];
    if (recent.length) buttons.push({ label: "Ajouter ma photo", primary: true, onClick: () => addFor(recent) });
    else if (mine) buttons.push({ label: "Ma photo", primary: true, onClick: () => { showEntry(mine, { onChange: changed }); } });
    else buttons.push({ label: "OK", primary: true });
    // Toutes mes photos de ce modèle (tous les avions de ce type que j'ai attrapés)
    const photos = Collection.all().filter((e) => catalogMatches(c, e.type, e.military));
    const addOld = h("button.btn.outline.block.mt", { onclick: () => { m.close(); addOldPhoto(c, { onChange: changed }); } }, icon("image", 16), " Ajouter une photo ancienne");
    const m = modal({ title: c.name, body: [img, h("div.kv.mt", lines.join("\n")), addOld, h("div.small.dim", { style: { marginTop: "4px" } }, "Sans vérification et sans XP"),
      photos.length && h("div.small", { style: { fontWeight: 700, margin: "12px 0 6px" } }, `Mes photos de ce modèle (${photos.length})`),
      photos.length && photoStrip(photos, { onChange: changed })].filter(Boolean), buttons });
  }

  async function addFor(cands) {
    const i = cands.length === 1 ? 0 : await choose("Lequel avez-vous photographié ?", cands.map((s) => `${s.label}\n${dateTime(s.seenAt)}`));
    if (i >= 0) { await askPhotoSource(cands[i]); changed(); }
  }

  function changed() { render(); onChange?.(); }

  render();
}

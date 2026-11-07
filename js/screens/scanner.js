// Onglet Scanner : radar en direct, réglages de zone, filtre de notifications.
import { creditLine, dataSources } from "../credits.js";
import { LOCALE, LANG, t } from "../i18n.js";
import { h, icon, meters, modal, toast, rarityMark, cardinal, dec, dragSlider } from "../util.js";
import { compassRose, nextMark } from "../compass.js";
import { Radar, showAircraftNotification, approachOf, approxPlace, approxLabel, mayBeVisible } from "../radar.js";
import { Prefs, Collection } from "../store.js";
import { Adsb, Wiki, aircraftPhotos, wmSize } from "../net.js";
import { wikiQuery, locationBadge, defaultLocationAlert, photoCtx } from "../ui.js";
import { KINDS, MODELS, filterMatches, UNCERTAIN_TEXT, rarityOf, rarityOfAc, approach, approachSortKey, acLabel, fmtDistance, fmtAltitude, fmtSpeed, prettyModel } from "../game.js";
import { go } from "../app.js";
import { Native, pushConfig } from "../native.js";
import { cameraButton } from "../camera.js";
import { Sound } from "../sound.js";

export function scanner(view) {
  const status = h("div.small.dim");
  const locBox = h("div", { style: { marginBottom: "4px" } });
  const list = h("div.list.mt");
  const empty = h("div.empty");
  // 30 vignettes au plus à l'écran (avec 200 avions autour, la liste devenait lourde sur téléphone) ; « Afficher les autres »
  let showMax = 30;
  const moreBtn = h("button.btn.block.mt", { style: { display: "none" }, onclick: () => { showMax += 30; render(); } });
  const toggle = h("button.btn.primary.grow", { onclick: () => (Radar.running ? Radar.stop() : startRadar()) });
  // Scan rapide : une recherche par seconde pendant 10 min (appli Android), pour suivre un passage de près
  const fastBtn = h("button.btn.outline", { title: "Une recherche par seconde pendant 10 minutes, puis retour à la fréquence choisie",
    onclick: async () => {
      if (Radar.fastUntil() > Date.now()) { Radar.stopFast(); return; }
      if (!Native) { modal({ title: "Scan rapide", body: "Le scan rapide (une recherche par seconde pendant 10 minutes) est réservé à l'appli Android Plane GO : c'est le téléphone qui interroge directement le service ADS-B. Dans un navigateur, le scan descend jusqu'à 5 s." }); return; }
      if (!Radar.canFast()) { modal({ title: "Mise à jour nécessaire", body: "Le scan rapide demande la version 1.14 de l'appli Android. Mets-la à jour depuis le Profil." }); return; }
      if (!(await Radar.startFast())) toast("Scan rapide indisponible pour l'instant");
    } });
  const setFast = () => {
    const left = Radar.fastUntil() - Date.now();
    const on = left > 0 && Radar.running;
    const text = on ? `Scan 1 s · ${clock(left / 1000)}` : "Scan 1 s";
    if (fastBtn.textContent !== text) fastBtn.textContent = text;
    fastBtn.classList.toggle("on", on);
    fastBtn.setAttribute("aria-pressed", on ? "true" : "false");
  };
  const notifBtn = h("button.btn.outline.block", { style: { textAlign: "left" }, onclick: () => editFilter(NOTIF, () => { notifBtn.textContent = filterSummary(); }) }, filterSummary());
  const listBtn = h("button.btn.outline.grow", { style: { textAlign: "left" }, onclick: () => editFilter(LIST, () => { listBtn.textContent = filterSummary(LIST); render(); }) }, filterSummary(LIST));

  // Position du téléphone introuvable (position choisie à la main, ou aucune) : avertissement bien visible
  const retryBtn = h("button.btn.outline", { onclick: async () => {
    retryBtn.disabled = true; retryBtn.textContent = "Recherche…";
    const ok = await Radar.retry();
    retryBtn.disabled = false; retryBtn.textContent = "Réessayer";
    toast(ok ? "Position du téléphone trouvée : le jeu fonctionne normalement" : "Position toujours introuvable : touche « Choisir ma position »", 4000);
  } }, "Réessayer");
  const warn = h("div.loc-warn", { style: { display: "none" } },
    h("b", "Position du téléphone introuvable"),
    h("p.loc-warn-txt"),
    h("div.row", h("button.btn.primary.grow", { onclick: () => defaultLocationAlert() }, "Choisir ma position"), retryBtn));

  const camBtn = cameraButton(); // petit bouton USB en haut à droite (appli Android)
  // Bouton « i » à côté : comment marchent le radar et le scan 1 s (textes retirés de l'écran pour l'alléger)
  const infoBtn = h("button.cam-btn", { type: "button", "aria-label": "Comment marche le radar", title: "Comment marche le radar",
    onclick: () => modal({ title: "Le radar", body: [
      Native
        ? "Appli Android : le radar continue écran éteint ou quand vous passez à une autre appli, et vous notifie. Une notification « radar actif » reste affichée ; « Arrêter le radar » l'éteint. Fermer Plane GO depuis les applis récentes (en la faisant glisser vers le haut) arrête tout (appli 1.23+)."
        : "Le radar fonctionne tant que Plane GO est ouvert à l'écran (l'écran reste allumé). Pour qu'il continue écran éteint, installez l'appli Android Plane GO.",
      "Scan 1 s : une recherche par seconde pendant 10 min pour suivre un passage de près, puis retour au réglage choisi. Un peu plus de batterie et de données.",
      "Scan toutes les : temps entre deux recherches d'avions (15 s par défaut).",
    ] }) }, icon("info", 18));
  const rose = compassRose({ size: 190, explain: "Chaque point de couleur est un avion de la liste (couleur de sa rareté, rouge pour un militaire) ; sa vignette porte une pastille de la même couleur. Plus le point est près du centre, plus l'avion est proche de vous. Le petit cercle orange montre où le prochain avion deviendra visible, et le trait qui part de l'avion montre dans quel sens il va." });
  // Sur ordinateur, deux colonnes : réglages et rose des vents à gauche, liste des avions à droite (une seule sur téléphone)
  view.append(h("div.scan-head", h("div.grow", h("div.kicker", "Scanner"), h("h1.title", "Le ciel autour de vous")), h("div.scan-tools", infoBtn, camBtn)), h("div.scan-layout", h("div.scan-side",
    locBox, warn, status, dataSources(),
    h("div.scan-rose", rose.el), // grande rose des vents, centrée, sous l'état du radar
    slider("Zone de détection", Prefs.RADIUS_STEPS, Prefs.radiusM, (v) => { Prefs.radiusM = v; pushConfig(); }),
    slider("Zone visible à l'œil nu", Prefs.VISIBLE_STEPS, Prefs.visibleM, (v) => { Prefs.visibleM = v; pushConfig(); render(); }),
    slider("Scan toutes les", Prefs.POLL_STEPS, Prefs.pollMs, (v) => { Radar.setPollMs(v); pushConfig(); }, seconds),
    h("div.row.mt", toggle, fastBtn),
    // Notifications à part, toujours visibles
    h("div.card.scan-box.mt", h("div.kicker", "Notifications"), notifBtn)),
    h("div.scan-main",
      // Filtre de la liste et « Le plus proche » (même filtre), juste au-dessus des avions
      h("div.card.scan-box", h("div.kicker", "Avions de la liste"),
        h("div.row", listBtn, h("button.btn.outline", { onclick: () => findNearest(() => { listBtn.textContent = filterSummary(LIST); render(); }),
          title: "Trouver l'avion en vol le plus proche parmi les types et modèles de la liste" }, "Le plus proche"))),
      empty, list, moreBtn)));

  async function startRadar() {
    if ("Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch { /* refusé */ } }
    Radar.start();
  }

  function render() {
    toggle.textContent = Radar.running ? "Arrêter le radar" : "Démarrer le radar";
    setFast();
    rose.setSweep(Radar.running); // le faisceau ne tourne que radar démarré
    const lines = [];
    if (!Radar.running) lines.push("Radar arrêté.");
    else {
      const l = Radar.location;
      lines.push(!l ? (Radar.noLocation ? "Position inconnue : indique ta ville pour que le radar cherche les avions." : "Recherche de la position GPS…")
        : l.isDefault ? approxLabel(l)
        : `Position : ${l.lat.toFixed(4)}, ${l.lon.toFixed(4)} (± ${Math.round(l.accuracy)} m)`);
      if (Radar.lastUpdate) lines.push(`${Radar.aircraft.length} avion(s), dont ${Radar.aircraft.filter((a) => a.military).length} militaire(s)${listFiltered() ? `, ${listed().length} dans la liste` : ""} — mis à jour à ${new Date(Radar.lastUpdate).toLocaleTimeString(LOCALE)}${Adsb.lastSource ? ` (source : ${Adsb.lastSource})` : ""}`);
    }
    if (Radar.error) lines.push("" + Radar.error);
    status.textContent = lines.join("\n");
    locBox.replaceChildren(Radar.running || Radar.location ? locationBadge(Radar.location) : "");
    const noGps = Radar.location?.isDefault || (!Radar.location && Radar.noLocation);
    warn.style.display = noGps ? "" : "none";
    if (noGps) warn.querySelector(".loc-warn-txt").textContent = Radar.location
      ? `Le GPS ne répond pas : le jeu utilise la position que tu as choisie (${approxPlace(Radar.location)}).`
      : "Sans position, le radar ne peut pas chercher les avions autour de toi : indique ta ville.";
    status.style.whiteSpace = "pre-line";

    const loc = Radar.location, vis = Prefs.visibleM / 1000;
    const base = listed();
    // Trajectoire calculée une seule fois par avion et par mise à jour (avant : à chaque comparaison du tri, puis encore pour
    // chaque vignette et pour la rose)
    const ap = new Map(loc ? base.map((ac) => [ac, approach(loc.lat, loc.lon, ac, vis)]) : []);
    // Option « Seulement les avions susceptibles d'être visibles » : déjà dans la zone visible, qui vont y passer, ou qui
    // passeront tout près (marge pour les avions encore loin, qui corrigent leur cap : mayBeVisible de radar.js)
    const all = Prefs.listVisibleOnly && loc ? base.filter((ac) => mayBeVisible(ac, ap.get(ac), vis)) : base;
    if (loc) all.sort((a, b) => approachSortKey(ap.get(a)) - approachSortKey(ap.get(b)) || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    // Les premiers seulement à l'écran (les plus intéressants : triés par heure de passage) ; tous restent sur la rose
    const shown = all.slice(0, showMax);
    moreBtn.style.display = all.length > showMax ? "" : "none";
    moreBtn.textContent = `Afficher les ${all.length - showMax} autres avions`;
    const caught = Collection.hexes();
    // Vignettes gardées d'une mise à jour à l'autre (sinon la liste et les photos clignotent) : on met à jour
    // leur contenu, on ne déplace les cartes que si l'ordre change, et on retire celles des avions partis.
    const els = shown.map((ac) => cardFor(ac).update(ac, caught, loc, vis, ap.get(ac)));
    const keep = new Set(shown.map((ac) => ac.hex));
    for (const hex of cards.keys()) if (!keep.has(hex)) cards.delete(hex);
    if (els.length !== list.children.length || els.some((el, i) => list.children[i] !== el)) list.replaceChildren(...els);
    list.querySelectorAll(".pastille.next").forEach((p) => p.classList.remove("next"));
    // Sur la rose des vents : où regarder pour le prochain avion visible
    const nextAc = loc && all.map((ac) => [ac, ap.get(ac)]).find(([, a]) => a && a.kind !== "AWAY" && a.kind !== "LANDS");
    const R = Prefs.radiusM / 1000;
    const dots = all.filter(onRose).map((ac) => ({ deg: ac.bearingDeg, kind: "dot", r: ac.distanceKm / R, color: dotColor(ac) }));
    rose.setMarks([...dots, nextAc && nextMark(nextAc[0], nextAc[1], vis, R)],
      nextAc ? { label: acLabel(nextAc[0]), deg: nextAc[1].lookDeg } : null, { visible: vis / R });
    // Pastille cerclée sur la vignette de l'avion relié au petit cercle de la rose
    if (nextAc) list.querySelector(`[data-hex="${nextAc[0].hex}"] .pastille`)?.classList.add("next");
    if (Radar.running && Radar.lastUpdate && loc) radarSounds(all, ap);
    empty.style.display = all.length ? "none" : "";
    empty.textContent = !Radar.running ? "Appuyez sur « Démarrer le radar » pour surveiller le ciel autour de vous."
      : !Radar.lastUpdate ? "Chargement…" : !Radar.aircraft.length ? "Aucun avion détecté dans le rayon."
      : Prefs.listVisibleOnly && base.length ? `Aucun avion ne va passer dans la zone visible (${meters(Prefs.visibleM)}) pour l'instant. ${base.length} autre(s) avion(s) dans le rayon (bouton « Liste » pour tous les voir).`
      : "Aucun avion de ces types ou modèles dans le rayon pour l'instant (bouton « Liste » pour changer le filtre).";
  }

  /**
   * Vignette d'un avion : quand le voir (compte à rebours) et où regarder à gauche, modèle et rareté au milieu, photo à droite.
   * Pastille en haut à gauche = couleur de son point sur la rose des vents. Le reste des infos est dans la fiche (toucher).
   * Créée une fois par avion puis mise à jour sur place (`update`) à chaque passage du radar.
   */
  const cards = new Map(); // hex -> carte
  const cardFor = (ac) => cards.get(ac.hex) || cards.set(ac.hex, makeCard(ac)).get(ac.hex);

  function makeCard(ac) {
    const time = h("span.ac-time");
    const pastille = h("span.pastille", { title: "Couleur de son point sur la rose des vents" });
    const arrowEl = arrow(0), svg = arrowEl.querySelector("svg"), dirV = h("span.v");
    const dir = h("div.ac-dir", arrowEl, dirV);
    const nm = h("span.nm"), mil = h("span.badge.mil", "MIL"), sol = h("span.badge.gnd", "AU SOL"), rar = h("div.ac-rar");
    const thumb = h("img.ac-thumb", { alt: "", referrerPolicy: "no-referrer", loading: "lazy" });
    const el = h("div.card.ac", { "data-hex": ac.hex, onclick: () => go("ac/" + ac.hex) },
      h("div.ac-when", h("div.ac-top", pastille, time), dir),
      h("div.ac-mid", h("div.ac-name", nm, mil, sol), rar),
      thumb);
    const txt = (node, v) => { if (node.textContent !== v) node.textContent = v; };
    let rarKey = "", photoKey = null;
    return { el, update(ac, caught, loc, vis, known) {
      const r = rarityOfAc(ac), extra = Radar.extras.get(ac.hex);
      const model = prettyModel(ac.description || (extra?.info ? `${extra.info.manufacturer} ${extra.info.model}`.trim() : "")) || acLabel(ac) || "Appareil non identifié";
      const a = known !== undefined ? known : loc ? approach(loc.lat, loc.lon, ac, vis) : null;
      time._a = a; time._ground = !!ac.onGround; setTime(time);
      const coming = a && a.kind !== "AWAY" && a.kind !== "LANDS" && Number.isFinite(a.lookDeg);
      const deg = coming ? a.lookDeg : ac.bearingDeg;
      // Court pour tenir dans la colonne : « NO 42° » (hauteur où regarder), « SO 6 km » (au plus près), « SE 2,7 km » (distance)
      const km = (v) => (v < 10 ? `${dec(v)} km` : `${Math.round(v)} km`);
      const dirText = [deg != null && cardinal(deg),
        a?.kind === "FAR" ? km(a.closest) : coming && a.lookElev != null ? `${Math.round(a.lookElev)}°`
          : ac.distanceKm != null ? km(ac.distanceKm) : null].filter(Boolean).join(" ");
      dir.style.display = deg != null ? "" : "none";
      if (deg != null) { svg.style.transform = `rotate(${Math.round(deg)}deg)`; txt(dirV, dirText); }
      pastille.style.display = onRose(ac) ? "" : "none";
      pastille.style.background = dotColor(ac);
      el.classList.toggle("mil", !!ac.military);
      el.classList.toggle("ground", !!ac.onGround); // au sol : carte atténuée, pas de prévision
      el.title = acLabel(ac);
      mil.style.display = ac.military ? "" : "none";
      sol.style.display = ac.onGround ? "" : "none";
      txt(nm, model);
      const rText = caught.has(ac.hex) ? `${r.label} · ✓ attrapé` : `${r.label} · ${r.xp} XP`;
      if (rarKey !== r.label + rText) { rarKey = r.label + rText; rar.replaceChildren(rarityMark(r, rText)); }
      // Photo cherchée de nouveau seulement si ce qui la décide change (immatriculation, compagnie connue plus tard, modèle)
      const pk = JSON.stringify(photoCtx(ac, extra));
      if (photoKey !== pk) { photoKey = pk; setPhoto(thumb, ac, extra, pk); }
      return el;
    } };
  }

  // Compte à rebours mis à jour chaque seconde
  const tick = setInterval(() => {
    list.querySelectorAll(".ac-time").forEach(setTime);
    setFast();
  }, 1000);
  // Plusieurs mises à jour d'affilée (position GPS, avions, fiches) : un seul calcul par image
  let pending = false;
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; render(); }); } };
  const unsub = Radar.subscribe(schedule);
  render();
  return () => { clearInterval(tick); unsub(); rose.stop(); camBtn?.cleanup?.(); };
}

// ---------- Vignettes : pastille, compte à rebours, flèche ----------
const onRose = (ac) => ac.bearingDeg != null && ac.distanceKm != null;
const dotColor = (ac) => (ac.military ? "var(--red)" : rarityOfAc(ac).color);
/** 25 s → « 0:25 », 3 min 10 s → « 3:10 », plus d'une heure → « 1 h 05 » */
function clock(sec) {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** Compte à rebours de la vignette : « Visible », « 0:25 » (avant d'être visible), « 3:10 » (passage au plus près), « S'éloigne ». */
function setTime(el) {
  const a = el._a, elapsed = (Date.now() - Radar.lastUpdate) / 1000;
  let text = "—", cls = "none";
  if (el._ground) { text = "Au sol"; cls = "ground"; }
  else if (a?.kind === "NOW") { text = "Visible"; cls = "word"; }
  else if (a?.kind === "SOON") { const left = a.toVisible - elapsed; text = left <= 0 ? "Visible" : clock(left); cls = left <= 0 ? "word" : ""; }
  else if (a?.kind === "FAR") { text = clock(a.tClosest - elapsed); cls = "far"; }
  else if (a?.kind === "LANDS") { text = "Atterrit"; cls = "land"; }
  else if (a?.kind === "AWAY") { text = "S'éloigne"; cls = "away"; }
  // Hélicoptère : « ≈ » devant le compte à rebours, la prévision est incertaine
  if (a?.uncertain && (a.kind === "SOON" || a.kind === "FAR") && text !== "Visible") text = "≈" + text;
  if (el.textContent !== text) el.textContent = text;
  el.className = "ac-time" + (cls ? " " + cls : "");
  el.title = el._ground ? "Avion au sol : pas de prévision de trajectoire"
    : a?.kind === "LANDS" ? "Il vient vers vous mais devrait atterrir avant d'arriver dans votre zone visible"
    : (a?.kind === "FAR" ? "Temps avant son passage au plus près (il restera trop loin pour être bien visible)"
      : a?.kind === "SOON" ? "Temps avant qu'il soit visible à l'œil nu" : "") + (a?.uncertain ? (a.kind === "SOON" || a.kind === "FAR" ? ". " : "") + UNCERTAIN_TEXT : "");
}
/** Petite flèche qui pointe vers le cap où regarder (nord en haut). */
function arrow(deg) {
  return h("span.ico", { html: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${Math.round(deg)}deg)"><path d="M12 20V4M6 10l6-6 6 6"/></svg>` });
}

// ---------- Photos des avions de la liste ----------
// Par avion : photo de l'appareil (adsbdb), sinon photo Wikipédia du modèle. Gardée en mémoire
// pour ne pas clignoter à chaque rafraîchissement du radar.
// Vignettes de la liste : la même photo que la fiche ouverte au toucher, qui affiche son crédit (aircraftPhotos : cet
// appareil, sinon le modèle aux couleurs de sa compagnie, Wikimedia Commons), en 250 px ; en attendant ou s'il n'y en a pas,
// la photo de l'article Wikipédia du modèle. Recherches Commons moins pressées que celles des fiches, gardées 7 jours (net.js).
const photos = new Map(); // hex -> { key, url, own } (vignette déjà trouvée, reprise à la réouverture du Scanner)
function setPhoto(img, ac, extra, key) {
  const show = (url) => { if (url && img.getAttribute("src") !== url) img.src = url; };
  const fresh = () => img._photoKey === key; // l'avion n'a pas changé de photo à chercher entre-temps
  img._photoKey = key;
  const known = photos.get(ac.hex);
  if (known) show(known.url);
  if (known?.key === key) return;
  let own = !!known?.own;
  const wiki = () => Wiki.find(wikiQuery.ac(ac)).then((s) => { if (s?.thumbnailUrl && fresh() && !own) show(s.thumbnailUrl); return s?.thumbnailUrl; }).catch(() => null);
  if (!known) wiki();
  img.onerror = () => { img.removeAttribute("src"); if (own) { own = false; photos.delete(ac.hex); wiki(); } };
  aircraftPhotos(photoCtx(ac, extra), { low: true }).catch(() => null).then(async (r) => {
    if (!fresh()) return;
    if (r?.urls?.[0]) { own = true; const url = wmSize(r.urls[0], 250); photos.set(ac.hex, { key, url, own }); show(url); return; }
    const url = await wiki();
    if (url && fresh() && !own) photos.set(ac.hex, { key, url, own: false });
  });
}

/** Réglage de distance : on fait glisser le rond (un toucher sur la barre ne change rien, voir dragSlider). */
const seconds = (ms) => (ms >= 60000 ? `${ms / 60000} min` : `${ms / 1000} s`);
function slider(label, steps, current, save, fmt = meters) {
  const idx = steps.reduce((best, v, i) => (Math.abs(v - current) < Math.abs(steps[best] - current) ? i : best), 0);
  const text = h("span", `${label} : ${fmt(steps[idx])}`);
  const hint = h("span.ds-hint", "Fais glisser le rond");
  const lab = h("div.mt.slider-label", text, hint);
  const input = dragSlider({ count: steps.length, value: idx, label, hint, valueText: (i) => fmt(steps[i]),
    onInput: (i) => { text.textContent = `${label} : ${fmt(steps[i])}`; },
    onChange: (i) => save(steps[i]) });
  return h("div", lab, input);
}

// ---------- Sons du radar ----------
// Gardés d'une ouverture du Scanner à l'autre : rouvrir l'onglet ne refait pas sonner les mêmes avions.
const heard = new Set(), heardVisible = new Set();
let blipAt = 0, contactAt = 0;
/** Écho de sonar quand de nouveaux avions entrent dans la liste, double bip quand l'un d'eux devient visible. */
function radarSounds(all, ap) {
  const now = Date.now();
  let fresh = false, visible = false;
  for (const ac of all) {
    if (!heard.has(ac.hex)) { heard.add(ac.hex); fresh = true; }
    if (ap.get(ac)?.kind === "NOW" && !heardVisible.has(ac.hex)) { heardVisible.add(ac.hex); visible = true; }
  }
  if (heard.size > 3000) heard.clear();
  if (heardVisible.size > 500) heardVisible.clear();
  if (visible && now - contactAt > 3000) { contactAt = now; Sound.contact(); }
  else if (fresh && now - blipAt > 5000) { blipAt = now; Sound.blip(); }
}

// ---------- Filtres : notifications et liste du Scanner ----------
// Même principe pour les deux : un avion passe s'il correspond à un type OU à un modèle coché.
const NOTIF = {
  prefix: "Notifications", title: "Me notifier pour ces types d'avion", modelsTitle: "Me notifier aussi pour ces modèles",
  get kinds() { return Prefs.notifyKinds; }, set kinds(v) { Prefs.notifyKinds = v; },
  get models() { return Prefs.notifyModels; }, set models(v) { Prefs.notifyModels = v; },
};
const LIST = {
  prefix: "Liste", title: "Afficher ces types d'avion dans la liste", modelsTitle: "Afficher aussi ces modèles",
  get kinds() { return Prefs.listKinds ?? KINDS.map((k) => k.key); }, set kinds(v) { Prefs.listKinds = v; },
  get models() { return Prefs.listModels; }, set models(v) { Prefs.listModels = v; },
};
/** Tous les types cochés et aucun modèle = pas de filtre (les avions sans type reconnu restent affichés). */
const listFiltered = () => !(LIST.kinds.length === KINDS.length && !LIST.models.length);
const listed = () => (listFiltered() ? Radar.aircraft.filter((ac) => filterMatches(ac, LIST.kinds, LIST.models)) : [...Radar.aircraft]);

export function filterSummary(f = NOTIF) {
  // Texte assemblé de morceaux : chacun traduit à part (t), sinon l'anglais ne reconnaîtrait pas la phrase entière
  const k = f.kinds, m = f.models, parts = [];
  if (k.length === KINDS.length) parts.push(t("tous les avions"));
  else if (k.length) parts.push(KINDS.filter((x) => k.includes(x.key)).map((x) => t(x.label.split(" (")[0])).join(", "));
  if (m.length) parts.push(m.length === 1 ? m[0] : t(`${m.length} modèles`));
  const vis = (f === NOTIF ? Prefs.notifyVisibleOnly : Prefs.listVisibleOnly) && parts.length ? t(", visibles à l'œil nu") : "";
  return `${t(f.prefix)}${LANG === "en" ? ":" : " :"} ` + (parts.length ? parts.join(" + ") + vis : t("aucun"));
}

function checks(items, selected) {
  return items.map((it) => {
    const box = h("input", { type: "checkbox", checked: selected.includes(it.key) });
    return { box, el: h("label.check", box, h("span", it.label)), key: it.key };
  });
}

/** Bouton « Tout cocher » / « Tout décocher » en un toucher, au-dessus d'une liste de cases. */
function allToggle(rows) {
  const btn = h("button.btn.outline.small.all-toggle", { type: "button" });
  const allOn = () => rows.every((r) => r.box.checked);
  const label = () => { btn.textContent = allOn() ? "Tout décocher" : "Tout cocher"; };
  btn.onclick = () => { const on = !allOn(); rows.forEach((r) => { r.box.checked = on; }); label(); };
  rows.forEach((r) => r.box.addEventListener("change", label));
  label();
  return btn;
}

function editFilter(f, onChange) {
  const rows = checks(KINDS.map((k) => ({ key: k.key, label: k.label })), f.kinds);
  const visible = h("input", { type: "checkbox", checked: f === NOTIF ? Prefs.notifyVisibleOnly : Prefs.listVisibleOnly });
  const save = () => {
    f.kinds = rows.filter((r) => r.box.checked).map((r) => r.key);
    if (f === NOTIF) Prefs.notifyVisibleOnly = visible.checked;
    else Prefs.listVisibleOnly = visible.checked;
    pushConfig(); onChange();
  };
  const body = f === NOTIF ? [
    h("label.check", visible, h("span", h("b", "Seulement s'il sera visible à l'œil nu"), h("br"),
      h("span.small.dim", `L'avion doit passer dans la zone visible (${meters(Prefs.visibleM)}). La notification donne le compte à rebours avant qu'il soit visible et où regarder.`))),
    h("div.row.mt.all-row", h("div.kicker.grow", "Types d'avion"), allToggle(rows)),
    ...rows.map((r) => r.el),
    h("p.small.dim.mt", (Native ? "Les notifications arrivent même appli fermée, tant que le radar est démarré. " : "Les notifications s'affichent tant que Plane GO est ouvert. ")
      + "Un avion est notifié s'il correspond à un type OU à un modèle coché."),
  ] : [
    h("label.check", visible, h("span", h("b", "Seulement les avions susceptibles d'être visibles"), h("br"),
      h("span.small.dim", `Avions déjà dans la zone visible (${meters(Prefs.visibleM)}) ou qui vont y passer. Les autres sont cachés de la liste et de la rose.`))),
    h("div.row.mt.all-row", h("div.kicker.grow", "Types d'avion"), allToggle(rows)),
    ...rows.map((r) => r.el),
    h("p.small.dim.mt", "La liste et la rose des vents ne montrent que les avions qui correspondent à un type OU à un modèle coché. Tout cocher = tous les avions."),
  ];
  const buttons = [{ label: `Modèles (${f.models.length})…`, onClick: () => { save(); editModels(f, onChange); } }];
  buttons.push({ label: "Enregistrer", primary: true, onClick: () => { save(); if (f === NOTIF && "Notification" in window && Notification.permission === "default") Notification.requestPermission(); } });
  modal({ title: f.title, body, buttons });
}

function editModels(f, onChange) {
  const rows = checks(MODELS.map((m) => {
    const r = rarityOf(m.codes[0], m.militaryOnly);
    return { key: m.label, label: r.ordinal >= 2 ? `${m.label}  ${r.stars}` : m.label };
  }), f.models);
  modal({ title: f.modelsTitle, body: [h("div.row.all-row", h("div.kicker.grow", `${MODELS.length} modèles`), allToggle(rows)), ...rows.map((r) => r.el)], buttons: [
    { label: "Enregistrer", primary: true, onClick: () => { f.models = rows.filter((r) => r.box.checked).map((r) => r.key); pushConfig(); onChange(); } },
  ] });
}

/**
 * « Le plus proche » : l'avion en vol le plus proche parmi les types et modèles de la liste du Scanner
 * (même filtre que la liste ; tous les avions si elle n'est pas filtrée). On cherche d'abord dans la zone de détection, puis de plus en plus loin (jusqu'à 460 km, la limite
 * des sources ADS-B) ; pour les militaires, dans le monde entier en dernier recours.
 */
async function findNearest(onFilterChange) {
  const kinds = LIST.kinds, models = LIST.models;
  const wanted = (a) => !listFiltered() || filterMatches(a, kinds, models);
  if (!kinds.length && !models.length) {
    modal({ title: "Aucun type d'avion choisi", body: "Choisissez d'abord les types d'avion de la liste (bouton « Liste ») : la recherche trouve le plus proche parmi eux.",
      buttons: [{ label: "Fermer" }, { label: "Choisir", primary: true, onClick: () => { editFilter(LIST, onFilterChange); } }] });
    return;
  }
  let cancelled = false;
  const wait = modal({ title: "Recherche…", body: h("p.small", `Avion le plus proche : ${filterSummary(LIST).replace(/^Liste : /, "")}`),
    buttons: [{ label: "Annuler" }], onClose: () => { cancelled = true; } });
  const progress = h("p.small.dim", "Position…");
  wait.content.append(progress);
  try {
    const loc = Radar.location || (await Radar.locate());
    if (!loc) { wait.close(); defaultLocationAlert(); return; }
    const zone = Prefs.radiusM / 1000;
    const radii = [...new Set([zone, 50, 150, 460].filter((r) => r >= zone))];
    let ac = null, failed = null;
    for (const r of radii) {
      if (cancelled) return;
      progress.textContent = `Recherche jusqu'à ${meters(r * 1000)}…`;
      try {
        const list = await Adsb.around(loc.lat, loc.lon, r);
        ac = list.find((a) => !a.onGround && wanted(a)) || null; // liste triée du plus proche au plus loin
      } catch (e) { failed = e; }
      if (ac) break;
    }
    if (!ac && kinds.includes("MILITARY") && !cancelled) {
      progress.textContent = "Recherche des militaires dans le monde entier…";
      try { ac = await Adsb.nearestMilitary(loc.lat, loc.lon); } catch (e) { failed = e; }
    }
    if (cancelled) return;
    wait.close();
    if (!ac) {
      modal({ title: failed ? "Service ADS-B injoignable" : "Aucun avion trouvé", body: failed
        ? `Détail : ${failed.message}\n\nCes services gratuits sont parfois saturés. Réessayez dans un moment.`
        : "Aucun avion de ces types n'est en vol à moins de 460 km pour l'instant. Réessayez plus tard ou ajoutez d'autres types d'avion." });
      return;
    }
    showNearest(ac, loc);
  } finally { wait.close(); }
}

/** Résultat de la recherche : nom, distance, direction, altitude ; la fiche s'ouvre même hors de la zone du radar. */
async function showNearest(ac, loc) {
  Radar.pin(ac);
  const r = rarityOfAc(ac);
  const name = h("div", { style: { fontWeight: 800, fontSize: "18px" } }, prettyModel(ac.description || ac.type) || "Type inconnu");
  const img = h("img.cover", { alt: "", style: { display: "none", objectFit: "contain", maxHeight: "200px" } });
  const lines = [
    ac.military ? "Avion militaire" : null,
    `${r.stars} ${r.label}`,
    `À ${fmtDistance(ac)}`,
    `Altitude : ${fmtAltitude(ac)} · vitesse : ${fmtSpeed(ac)}`,
    loc.isDefault ? `Distance mesurée depuis la position que tu as choisie (${approxPlace(loc)}).` : null,
  ].filter(Boolean);
  const buttons = [{ label: "Fermer" }];
  if (!Native && "Notification" in window) buttons.push({ label: "En notification", onClick: async () => {
    if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") { toast("Notifications refusées dans le navigateur"); return false; }
    await showAircraftNotification(ac, approachOf(ac, loc)); toast("Notification envoyée"); return false;
  } });
  buttons.push({ label: "Voir la fiche ›", primary: true, onClick: () => { go("ac/" + ac.hex); } });
  const credit = creditLine();
  modal({ title: `${acLabel(ac)}`, body: [img, credit, name, h("div.kv.small.mt", lines.join("\n"))], buttons });
  const extra = await Radar.extra(ac).catch(() => null);
  // Photo libre de cet appareil (ou du modèle aux couleurs de sa compagnie, Wikimedia Commons), sinon celle de l'article
  // Wikipédia du modèle ; jamais airport-data (pas de licence libre). La recherche Commons attend 6 s au plus.
  const [own, wiki] = await Promise.all([
    Promise.race([aircraftPhotos(photoCtx(ac, extra)).catch(() => null), new Promise((r) => setTimeout(() => r(null), 6000))]),
    Wiki.find(wikiQuery.ac(ac)).catch(() => null),
  ]);
  const srcs = [...(own?.urls || []).slice(0, 2), wiki?.imageUrl, wiki?.thumbnailUrl].filter(Boolean);
  let i = 0;
  const next = () => { if (i < srcs.length) img.src = srcs[i++]; };
  img.onload = () => { img.style.display = "block"; credit.set(srcs[i - 1]); };
  img.onerror = next;
  next();
  if (extra?.info && !ac.description) name.textContent = prettyModel(`${extra.info.manufacturer} ${extra.info.model}`) || name.textContent;
}

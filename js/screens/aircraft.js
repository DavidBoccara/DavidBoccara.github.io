// Fiche d'un avion du radar : photo, provenance, vol en direct, approche, capture, Wikipédia.
import { creditLine } from "../credits.js";
import { DEC } from "../i18n.js";
import { h, meters, cardinal, direction, dec, rarityMark } from "../util.js";
import { compassRose, nextMark } from "../compass.js";
import { Radar } from "../radar.js";
import { Wiki } from "../net.js";
import { Collection, Prefs, entryPhotoItems, ALBUM_MAX } from "../store.js";
import { spottedFrom, computeXp, describeXp, approach, approachLabel, UNCERTAIN_TEXT, acLabel, countryFromHex, modelKey,
  fmtDistance, fmtAltitude, fmtSpeed, prettyModel } from "../game.js";
import { addPhoto, wikiQuery, photoStrip, aircraftPhotoBlock } from "../ui.js";
import { back } from "../app.js";
import { Camera, claimPhotos, photoFile, liveThumb } from "../camera.js";

export function aircraftPage(view, [hex]) {
  let ac = Radar.find(hex);
  const head = h("div.page-head", h("button.back", { onclick: back, "aria-label": "Retour" }, "‹"), h("h1.title.grow", ac ? acLabel(ac) : "Avion"));
  view.append(head);
  if (!ac) {
    // Ouverture depuis une notification : le radar a peut-être besoin de quelques secondes
    const msg = h("div.empty", Radar.running ? "Recherche de l'avion…" : "Cet avion n'est plus dans la zone du radar.\n\nDémarrez le radar (onglet Scanner) pour suivre les avions en direct.");
    view.append(msg);
    let done = false, inner = null;
    const stopWait = Radar.subscribe(() => {
      if (done) return;
      if (Radar.find(hex)) { done = true; stopWait(); view.replaceChildren(); inner = aircraftPage(view, [hex]); }
      else if (Radar.lastUpdate) msg.textContent = "Cet avion n'est plus dans la zone du radar.";
    });
    return () => { done = true; stopWait(); inner?.(); };
  }
  let extra = Radar.extras.get(hex) || null;
  // Photo libre de cet appareil (ou du modèle aux couleurs de sa compagnie) : Wikimedia Commons, jamais airport-data
  const photo = aircraftPhotoBlock();
  const name = h("h2", { style: { margin: "12px 0 0" } });
  const prov = h("div.kv.small");
  const appr = h("div", { style: { fontWeight: 700, color: "var(--green)", whiteSpace: "pre-line" } });
  const apprSub = h("div.small.dim", { style: { whiteSpace: "pre-line" } });
  // Rose des vents : point plein = où est l'avion, cercle = où il apparaîtra dans la zone visible
  const rose = compassRose({ size: 132, explain: "Le point orange plein montre où se trouve l'avion en ce moment ; le petit cercle, l'endroit où il entrera dans votre zone visible ; le trait entre les deux montre dans quel sens il va." });
  const where = h("div.kv.small.grow");
  const rarityText = h("div.rarity-big");
  const collectText = h("div.kv.small");
  const myPhotos = h("div");
  // Appareil photo branché par câble : les photos prises pendant que la fiche est ouverte s'ajoutent à cet avion
  const camInfo = h("div.small.cam-fiche"), camStrip = h("div.cam-thumbs");
  const camBtn = h("button.btn.primary.grow", { onclick: () => capture(true) }, "Photographier cet avion");
  const flight = h("div.kv.small");
  const wikiImg = h("img.cover", { alt: "", style: { display: "none", maxHeight: "240px", borderRadius: "12px" } });
  const wikiCredit = creditLine();
  const wikiTitle = h("h3", { style: { margin: "8px 0 0" } });
  const wikiKind = h("div.small", { style: { color: "var(--cyan)" } });
  const wikiText = h("p.small", "Recherche sur Wikipédia…");
  const wikiBtn = h("a.btn.outline", { target: "_blank", rel: "noopener", style: { display: "none", textDecoration: "none" } }, "Lire l'article complet");

  view.append(
    h("div.row", ac.military && h("span.badge.mil", "MILITAIRE")), photo, name, prov,
    h("div.section", "Où regarder"), h("div.row", { style: { alignItems: "center", gap: "14px" } }, rose.el, where),
    h("div.section", "Approche"), appr, apprSub,
    h("div.section", "Collection"), rarityText, collectText, myPhotos, camInfo, camStrip,
    h("div.row.mt", camBtn, h("button.btn.outline", { onclick: () => capture(false) }, "Galerie")),
    h("div.section", "Vol en direct"), flight,
    h("a.btn.outline.mt", { href: `https://globe.airplanes.live/?icao=${hex.toLowerCase()}`, target: "_blank", rel: "noopener", style: { display: "inline-block", textDecoration: "none" } }, "Voir sur la carte"),
    h("div.section", "Wikipédia"), wikiImg, wikiCredit, wikiTitle, wikiKind, wikiText, wikiBtn,
  );

  const spotted = () => spottedFrom(ac, extra, Radar.location?.lat, Radar.location?.lon);
  async function capture(camera) { await addPhoto(spotted(), { camera, seenAt: Date.now() }); renderCollection(); }

  function renderHeader() {
    const info = extra?.info;
    name.textContent = prettyModel(ac.description || (info ? `${info.manufacturer} ${info.model}` : "")) || "Type inconnu";
    const route = extra?.route, country = countryFromHex(hex);
    const lines = route ? [`Départ : ${airportLine(route.origin)}`, `Arrivée : ${airportLine(route.destination)}`, route.airline && `Compagnie : ${route.airline}`]
      : ["Trajet : non communiqué pour ce vol"];
    const owner = info?.owner || ac.operator;
    if (owner && owner !== route?.airline) lines.push(`Propriétaire / opérateur : ${owner}`);
    const ctry = country?.label || info?.countryName;
    if (ctry) lines.push(`Pays d'immatriculation : ${ctry}`);
    prov.textContent = lines.filter(Boolean).join("\n");
  }
  function renderCollection() {
    const r = computeXp(spotted(), { hasModel: Collection.hasModel, countForHex: Collection.countForHex });
    rarityText.replaceChildren(rarityMark(r.rarity));
    const caught = Collection.caughtFor(hex);
    const album = caught ? entryPhotoItems(caught).length : 0;
    collectText.textContent = caught ? `Déjà attrapé (+${caught.xp} XP) · album ${album}/${ALBUM_MAX}. Tes nouvelles photos s'ajoutent à son album, sans XP en plus.`
      : r.zeroReason ? `${r.zeroReason} : approchez-vous pour gagner des XP.` : `${describeXp(r)}\n= ${r.total} XP si vous le photographiez !`;
    camBtn.textContent = caught ? "Encore une photo" : "Photographier cet avion";
    camBtn.disabled = !!caught && album >= ALBUM_MAX;
    // Mes photos de cet avion, puis celles d'autres avions du même modèle
    const sp = spotted(), key = modelKey(sp);
    const same = Collection.forHex(hex), others = key ? Collection.all().filter((e) => e.hex !== hex && modelKey(e) === key) : [];
    myPhotos.replaceChildren(...[
      same.length && h("div.small", { style: { fontWeight: 700, margin: "10px 0 6px" } }, same.length > 1 || album > 1 ? "Mes photos de cet avion" : "Ma photo de cet avion"),
      same.length && photoStrip(same, { onChange: renderCollection }),
      others.length && h("div.small", { style: { fontWeight: 700, margin: "10px 0 6px" } }, `Mes autres photos de ce modèle (${others.length})`),
      others.length && photoStrip(others, { onChange: renderCollection }),
    ].filter(Boolean));
  }
  function renderFlight() {
    flight.textContent = [ac.callsign && `Indicatif : ${ac.callsign}`, ac.registration && `Immatriculation : ${ac.registration}`,
      ac.type && `Code type OACI : ${ac.type}`, `Code ICAO 24 bits : ${hex.toUpperCase()}`, `Position : ${fmtDistance(ac)}`,
      `Altitude : ${fmtAltitude(ac)}`, `Vitesse : ${fmtSpeed(ac)}`,
      ac.trackDeg != null && `Cap : ${Math.round(ac.trackDeg)}° (vers le ${cardinal(ac.trackDeg)})`].filter(Boolean).join("\n");
  }
  /** Position actuelle de l'avion sur la rose des vents et en toutes lettres. */
  function renderWhere(a) {
    const deg = ac.bearingDeg, km = ac.distanceKm;
    const elev = km != null && ac.altitudeFt != null && !ac.onGround ? Math.round((Math.atan2(ac.altitudeFt * 0.3048 / 1000, Math.max(km, 0.05)) * 180) / Math.PI) : null;
    const soon = a && (a.kind === "SOON" || a.kind === "FAR") && Number.isFinite(a.lookDeg);
    const R = Prefs.radiusM / 1000, vis = Prefs.visibleM / 1000;
    rose.setSweep(Radar.running);
    rose.setMarks([deg != null && { deg, kind: "now", r: km != null ? km / R : 1 }, soon && nextMark(ac, a, vis, R)],
      deg != null ? { label: acLabel(ac), deg } : null, { visible: vis / R });
    where.textContent = deg == null ? "Position de l'avion inconnue."
      : [`● En ce moment : ${direction(deg)} (cap ${Math.round(deg) % 360}°)`, km != null && `à ${dec(km)} km de vous`,
        elev != null && (elev >= 75 ? "presque au-dessus de vous" : `${elev}° au-dessus de l'horizon`),
        soon && `\n○ Apparaîtra ${direction(a.lookDeg)} (cap ${Math.round(a.lookDeg) % 360}°)`].filter(Boolean).join("\n");
  }
  function renderApproach() {
    const loc = Radar.location, a = loc && approach(loc.lat, loc.lon, ac, Prefs.visibleM / 1000);
    renderWhere(a);
    if (ac.onGround) { appr.textContent = "Au sol"; apprSub.textContent = "Avion au sol (au parking, au roulage ou à l'arrêt) : pas de prévision de trajectoire."; return; }
    if (!a) { appr.textContent = loc ? "Trajectoire inconnue" : "Position inconnue — démarrez le radar"; apprSub.textContent = ""; return; }
    appr.textContent = approachLabel(a, (Date.now() - (ac.fetchedAt || Radar.lastUpdate)) / 1000);
    apprSub.textContent = (a.kind === "AWAY" ? "Il ne passera pas plus près de vous."
      : a.kind === "LANDS" ? "Il est en descente vers une piste : il n'entrera pas dans votre zone visible."
      : `Passage au plus près : ${a.closest.toFixed(1).replace(".", DEC)} km de vous. Zone visible : ${meters(Prefs.visibleM)}. Prévision d'après sa route actuelle.`)
      + (a.uncertain ? "\n" + UNCERTAIN_TEXT : "");
  }

  renderHeader(); renderCollection(); renderFlight(); renderApproach();
  const tick = setInterval(renderApproach, 1000);
  const unsub = Radar.subscribe(() => { const n = Radar.find(hex); if (n) { ac = n; renderFlight(); } });
  // Avion hors de la zone du radar (trouvé par « le plus proche ») : on le suit nous-mêmes toutes les 15 s
  const follow = setInterval(() => Radar.refreshPinned(hex), 15000);

  Radar.extra(ac).then((x) => {
    extra = x; renderHeader(); renderCollection();
    photo.load({ registration: ac.registration, airline: x?.route?.airline || ac.operator || x?.info?.owner, model: prettyModel(ac.description || "") });
  });
  Wiki.find(wikiQuery.ac(ac)).then((s) => {
    if (!s) { wikiText.textContent = "Aucun article Wikipédia trouvé pour ce modèle."; return; }
    wikiTitle.textContent = s.title; wikiText.textContent = s.extract;
    wikiKind.textContent = s.searchOnly ? "Pas d'article : recherche Wikipédia" : "Article sur le modèle de l'appareil";
    wikiBtn.href = s.pageUrl; wikiBtn.style.display = "inline-block";
    if (s.searchOnly) wikiBtn.textContent = "Chercher sur Wikipédia";
    const src = s.imageUrl || s.thumbnailUrl;
    if (src) { wikiImg.onerror = () => { if (wikiImg.src !== s.thumbnailUrl) wikiImg.src = s.thumbnailUrl; }; wikiImg.src = src; wikiImg.style.display = "block"; wikiCredit.set(src); }
  });
  // ---------- Photos de l'appareil photo branché (appli Android 1.17+) ----------
  // Elles apparaissent ici dès qu'elles sont prises : × pour supprimer une photo ratée, toucher pour la voir en grand,
  // puis « Ajouter à cet avion » (vérification habituelle, toutes ensemble).
  const session = [];   // photos reçues pendant que la fiche est ouverte, pas encore ajoutées
  let busy = false;
  const addBtn = h("button.btn.primary.block.mt", { onclick: () => addSession() });
  const removeOne = (p) => {
    const i = session.findIndex((x) => x.id === p.id);
    if (i >= 0) session.splice(i, 1);
    Camera.remove(p.id);
    renderCam();
  };
  const renderCam = () => {
    if (!Camera.available()) return;
    const st = Camera.state();
    camInfo.textContent = st.state === "ready" ? "Appareil photo branché : les photos que tu prends maintenant arrivent ici." : "";
    camStrip.replaceChildren(...session.map((p) => liveThumb(p, { label: busy ? "Vérification…" : "", onDelete: removeOne })));
    if (session.length) {
      addBtn.textContent = busy ? "Vérification…" : `Ajouter ${session.length > 1 ? `les ${session.length} photos` : "la photo"} à cet avion`;
      addBtn.disabled = busy;
      camStrip.append(h("div.small.dim.cam-count", "× pour supprimer une photo ratée, toucher une photo pour la voir en grand."), addBtn);
    }
  };
  async function addSession() {
    if (busy || !session.length) return;
    busy = true; renderCam();
    const batch = session.slice();
    try {
      const files = await Promise.all(batch.map((p) => photoFile(p).catch(() => null)));
      const ok = batch.filter((_, i) => files[i]);
      const res = ok.length ? await addPhoto(spotted(), { files: files.filter(Boolean), seenAt: Date.now() }) : null;
      if (res) {
        ok.forEach((p) => Camera.done(p.id)); // rangées : elles ne sont plus proposées ailleurs
        batch.forEach((p) => { const i = session.indexOf(p); if (i >= 0) session.splice(i, 1); });
      }
    } finally {
      busy = false;
      renderCam(); renderCollection();
    }
  }
  const unclaim = Camera.available() ? claimPhotos((list) => { session.push(...list); renderCam(); }) : null;
  const unCam = Camera.available() ? Camera.subscribe(renderCam) : null;
  renderCam();

  return () => { clearInterval(tick); clearInterval(follow); unsub(); rose.stop(); unclaim?.(); unCam?.(); };
}

function airportLine(a) {
  const place = [a.city, a.countryName].filter(Boolean).join(", "), code = a.iata || a.icao;
  return `${a.name || a.city}${code ? ` (${code})` : ""}${place && a.name ? ` — ${place}` : ""}`;
}

// Éléments d'interface partagés : fiche Wikipédia, photos, captures, partage.
import { LOCALE } from "./i18n.js";
import { h, modal, toast, icon, pickImage, toJpeg, imageKind, exifDate, confirmBox, choose, dateTime, dateDay, dec, rarityMark } from "./util.js";
import { Wiki, AdsbDb } from "./net.js";
import { Supa } from "./supa.js";
import { ensurePhotoRules, requireAccount } from "./photorules.js";
import { Collection, Sightings, createCatch, addAlbumPhoto, removeEntryPhoto, setMainEntryPhoto, entryPhotoItems, entryPhotos, ALBUM_MAX, catchMessage, entryPhoto, entryLabel, entryModel, entryRarity, Player } from "./store.js";
import { Cloud, sync } from "./cloud.js";
import { flagOf, distanceBonus, MAX_PHOTO_KM, computeXp, spottedRarity, prettyModel } from "./game.js";
import { renderHud, install, isStandalone, isIos, isAndroid, go } from "./app.js";
import { Native } from "./native.js";
import { APK_HOME } from "./config.js";
import { Sound } from "./sound.js";
import { DEFAULT_LOCATION, Radar } from "./radar.js";
import { verifyPhoto, checksText } from "./verify.js";

export const wikiQuery = {
  entry: (e) => ({ type: e.type, model: e.model, military: e.military, title: entryModel(e) || entryLabel(e) }),
  spotted: (s) => ({ type: s.type, model: s.model, military: s.military, title: prettyModel(s.model || s.type) }),
  famous: (f) => ({ type: f.codes[0], model: f.name, military: f.military, title: f.name }),
  ac: (ac) => ({ type: ac.type, model: ac.description, military: ac.military, title: prettyModel(ac.description || ac.type) }),
};

/** Pastille ronde « W » qui affiche la photo Wikipédia et ouvre la fiche. */
export function wikiDot(q) {
  const dot = h("button.wiki-dot", { "aria-label": "Fiche Wikipédia du modèle", onclick: (e) => { e.stopPropagation(); showWiki(q); } }, "W");
  Wiki.find(q).then((s) => { if (s?.thumbnailUrl) { dot.style.backgroundImage = `url("${s.thumbnailUrl}")`; dot.classList.add("has-img"); } });
  return dot;
}

/** Remplit une image avec la photo Wikipédia du modèle. */
export function wikiImg(img, q, onDone) {
  Wiki.find(q).then((s) => { if (s?.thumbnailUrl) img.src = s.thumbnailUrl; onDone?.(!!s?.thumbnailUrl); });
}

/** Fiche Wikipédia : grande photo, résumé et lien vers l'article. */
export function showWiki(q) {
  const img = h("img", { alt: "Photo Wikipédia de l'avion", style: { display: "none" } });
  const title = h("h2.modal-title", q.title || "Wikipédia");
  const text = h("p", "Recherche sur Wikipédia…");
  let page = null, label = "Ouvrir Wikipédia";
  const m = modal({ body: [img, title, h("div.small", { style: { color: "var(--cyan)" } }, "Wikipédia"), text],
    buttons: [{ label: "Fermer" }, { label, primary: true, onClick: () => { if (page) window.open(page, "_blank", "noopener"); return !!page; } }] });
  Wiki.find(q).then((s) => {
    if (!s) { text.textContent = navigator.onLine ? "Aucun article Wikipédia trouvé pour cet avion." : "Pas de connexion internet."; return; }
    title.textContent = s.title; text.textContent = s.extract; page = s.pageUrl;
    if (s.searchOnly) m.el.querySelector(".modal-actions .primary").textContent = "Chercher sur Wikipédia";
    const src = s.imageUrl || s.thumbnailUrl;
    if (src) { img.onerror = () => { if (s.thumbnailUrl && img.src !== s.thumbnailUrl) img.src = s.thumbnailUrl; }; img.src = src; img.style.display = "block"; }
  });
}

// ---------- Fiche d'un avion photographié (publication du feed) ----------

/**
 * Infos de l'avion d'une capture, comme dans le Scanner : modèle, rareté, XP, immatriculation, opérateur,
 * pays, trajet, distances, puis la fiche de l'appareil (adsbdb : constructeur, propriétaire, photo)
 * et le résumé Wikipédia du modèle. c : capture (catchFrom) ou objet aux mêmes champs.
 */
export function aircraftInfoCard(c) {
  const r = c.rarity, model = prettyModel(c.model || c.type) || "Type inconnu";
  const owner = h("div.kv.small");
  const acPhoto = h("img.cover", { alt: "Photo de l'appareil", style: { display: "none", maxHeight: "220px", borderRadius: "12px", marginTop: "8px" } });
  const credit = h("div.small.dim", { style: { display: "none" } }, "Photo de cet appareil : adsbdb / planespotters.net");
  const wImg = h("img.cover", { alt: "", style: { display: "none", maxHeight: "200px", borderRadius: "12px" } });
  const wTitle = h("h3", { style: { margin: "8px 0 0" } });
  const wText = h("p.small", { style: { display: "-webkit-box", WebkitLineClamp: "5", WebkitBoxOrient: "vertical", overflow: "hidden" } }, "Recherche sur Wikipédia…");
  const wBtn = h("a.btn.outline.small", { target: "_blank", rel: "noopener", style: { display: "none", textDecoration: "none" } }, "Lire l'article complet");
  const live = c.hex && Radar.find(c.hex);
  const lines = [
    c.registration && `Immatriculation : ${c.registration}`, c.callsign && `Indicatif : ${c.callsign}`,
    c.type && `Code type OACI : ${c.type}`, c.hex && `Code ICAO 24 bits : ${c.hex.toUpperCase()}`,
    c.operator && `Opérateur : ${c.operator}`, c.countryName && `Pays d'immatriculation : ${flagOf(c.countryIso)} ${c.countryName}`,
    c.route && `Trajet : ${c.route}`,
    c.flightKm != null && `Distance du vol : ${Math.round(c.flightKm).toLocaleString(LOCALE)} km (${distanceBonus(c.flightKm).label})`,
    c.distanceKm != null && `Distance au moment de la photo : ${dec(c.distanceKm)} km`,
    c.takenAt && `Photographié le ${dateTime(c.takenAt)}`, c.source === "import" && "Photo ajoutée après coup",
  ].filter(Boolean);
  const card = h("div.card.pad.mt",
    h("div.section", { style: { marginTop: 0 } }, "L'avion"),
    h("h2", { style: { margin: "4px 0 2px" } }, model, c.military ? " · militaire" : ""),
    h("div", rarityMark(r, `${r.label}${c.xp != null ? ` · ${c.xp > 0 ? "+" + c.xp : 0} XP` : ""}`)),
    h("div.kv.small.mt", lines.join("\n")), owner, acPhoto, credit,
    live && h("button.btn.primary.block.mt", { onclick: () => go("ac/" + c.hex) }, "Il vole près de vous en ce moment : voir où il est"),
    c.hex && h("a.btn.outline.small.mt", { href: `https://globe.airplanes.live/?icao=${c.hex.toLowerCase().replace(/^~/, "")}`, target: "_blank", rel: "noopener",
      style: { display: "inline-block", textDecoration: "none" } }, "Voir sur la carte en direct"),
    h("div.section", "Wikipédia"), wImg, wTitle, wText, wBtn);
  // Fiche de l'appareil (constructeur, propriétaire, photo de cet avion précis)
  if (c.hex) AdsbDb.aircraft(c.hex).then((info) => {
    if (!info) return;
    owner.textContent = [info.manufacturer && `Constructeur : ${info.manufacturer}${info.model ? ` ${info.model}` : ""}`,
      info.owner && info.owner !== c.operator && `Propriétaire : ${info.owner}`].filter(Boolean).join("\n");
    if (info.photoUrl) { acPhoto.onload = () => { acPhoto.style.display = "block"; credit.style.display = ""; }; acPhoto.src = info.photoUrl; }
  }).catch(() => {});
  Wiki.find({ type: c.type, model: c.model, military: c.military, title: model }).then((s) => {
    if (!s) { wText.textContent = "Aucun article Wikipédia trouvé pour ce modèle."; return; }
    wTitle.textContent = s.title; wText.textContent = s.extract;
    wBtn.href = s.pageUrl; wBtn.style.display = "inline-block";
    if (s.searchOnly) wBtn.textContent = "Chercher sur Wikipédia";
    const src = s.thumbnailUrl || s.imageUrl;
    if (src) { wImg.src = src; wImg.style.display = "block"; }
  }).catch(() => { wText.textContent = "Wikipédia est injoignable pour l'instant."; });
  return card;
}

// ---------- Position (téléphone ou par défaut) ----------

/** Petit badge : 📱 position du téléphone ou 📌 position par défaut (Le Plessis-Robinson). Touchez pour l'explication. */
export function locationBadge(loc) {
  if (!loc) return h("span.loc-badge.none", "Position en attente…");
  if (!loc.isDefault) return h("button.loc-badge.phone", { onclick: () => modal({ title: "Position du téléphone",
    body: `Plane GO utilise la position GPS de votre téléphone${loc.accuracy ? ` (précision ± ${Math.round(loc.accuracy)} m)` : ""}.` }) },
    "Position du téléphone");
  return h("button.loc-badge.default", { onclick: () => defaultLocationAlert() },
    `Position par défaut : ${DEFAULT_LOCATION.name}`);
}

/** Où autoriser la position, selon l'appareil. */
function locationFixSteps() {
  if (Native) return [
    "Si Android te demande l'accès à ta position, réponds « Autoriser ».",
    "Sinon : Paramètres du téléphone › Applications › Plane GO › Autorisations › Position › « Autoriser seulement si l'appli est en cours d'utilisation ».",
  ];
  if (isIos()) return [
    "Si l'iPhone te demande l'accès à ta position, réponds « Autoriser ».",
    "Sinon : Réglages › Confidentialité et sécurité › Service de localisation : activé, puis « Sites Safari » › « Lorsque l'app est active ».",
  ];
  return [
    "Si le navigateur te demande l'accès à ta position, réponds « Autoriser ».",
    `Sinon : touche (ou clique) le cadenas à gauche de l'adresse ${location.hostname} › Autorisations › Position › Autoriser, puis recharge la page.`,
  ];
}

/**
 * Fenêtre « ⚠️ Position introuvable » : le jeu tourne sur la position par défaut (Le Plessis-Robinson), ce n'est pas
 * normal. Explique ce qui ne marche pas et comment corriger ; « Réessayer » redemande la position. Se ferme seule
 * dès que la position du téléphone est trouvée.
 */
let alertOpen = null;
export function defaultLocationAlert() {
  if (alertOpen) return;
  const why = Radar.location?.why;
  let unsub = null;
  const m = modal({
    title: "Position introuvable",
    body: [
      `${why ? why + ". " : ""}Ce n'est pas normal : Plane GO ne connaît pas ta position et utilise à la place une position par défaut, ${DEFAULT_LOCATION.name} (Hauts-de-Seine).`,
      h("div.loc-warn-box", h("b", "Le jeu ne fonctionne donc pas à pleine capacité :"), h("ul",
        h("li", `le radar, les distances et les notifications concernent le ciel ${DEFAULT_LOCATION.of}, pas le tien ;`),
        h("li", "le quiz te montre des avions qui ne passent pas au-dessus de toi ;"),
        h("li", "les passages enregistrés (Au-dessus, Quiz du jour) ne sont pas ceux de chez toi ;"),
        h("li", "tes photos d'avions risquent d'être refusées (lieu de la photo trop loin)."))),
      h("div.loc-warn-box.fix", h("b", "Pour corriger :"), h("ul",
        ...locationFixSteps().map((s) => h("li", s)),
        h("li", "Vérifie aussi que la localisation (GPS) du téléphone est activée."))),
    ],
    onClose: () => { alertOpen = null; unsub?.(); },
    buttons: [{ label: "J'ai compris" }, { label: "Réessayer", primary: true, onClick: async () => {
      const btn = m.el.querySelector(".modal-actions .btn.primary");
      btn.disabled = true; btn.textContent = "Recherche…";
      const ok = await Radar.retry();
      if (ok) return true; // la fenêtre se ferme (message affiché par l'abonnement ci-dessous)
      btn.disabled = false; btn.textContent = "Réessayer";
      toast("Position toujours introuvable : vérifie l'autorisation et le GPS, puis réessaie", 4000);
      return false;
    } }],
  });
  alertOpen = m;
  // Position du téléphone trouvée (autorisation donnée, GPS revenu) : la fenêtre se ferme toute seule
  unsub = Radar.subscribe((r) => {
    if (r.location && !r.location.isDefault) { m.close(); toast("Position du téléphone trouvée : le jeu fonctionne normalement", 4000); }
  });
}

/**
 * Au lancement : surveille la position ; si le jeu passe sur la position par défaut, la fenêtre d'alerte s'ouvre
 * une fois par lancement (après quelques secondes, au cas où le GPS arrive entre-temps).
 */
export function watchDefaultLocation() {
  let shown = false, timer = null;
  Radar.subscribe((r) => {
    if (shown || timer || !r.location?.isDefault) return;
    timer = setTimeout(() => {
      timer = null;
      if (shown || !Radar.location?.isDefault) return;
      shown = true; defaultLocationAlert();
    }, 5000);
  });
}

// ---------- Photos et captures ----------

const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
/** Nom de fichier lisible : « PlaneGO_Airbus-A320_2026-11-02.jpg » */
export function photoName(model, ms = Date.now()) {
  const day = new Date(ms).toISOString().slice(0, 10);
  const m = String(model || "avion").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `PlaneGO_${m || "avion"}_${day}.jpg`;
}

/**
 * Enregistre une photo sur le téléphone. src : Blob/File (photo de la collection, original de l'appareil photo),
 * adresse https (photo du feed) ou data:. Appli Android 1.9+ : directement dans la galerie (Images › Plane GO).
 * Téléphone (navigateur, iPhone) : menu de partage → « Enregistrer l'image ». Ordinateur : téléchargement.
 */
export async function savePhoto(src, name = "PlaneGO.jpg") {
  try {
    if (Native) {
      if (typeof Native.savePhoto !== "function") { toast("Mets à jour l'appli Plane GO (Profil) pour enregistrer les photos dans la galerie", 5000); return; }
      const url = src instanceof Blob ? await blobToDataUrl(src) : (/^blob:/.test(src) ? await blobToDataUrl(await (await fetch(src)).blob()) : src);
      Native.savePhoto(url, name); // l'appli affiche le résultat
      return;
    }
    const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
    const file = new File([blob], name, { type: blob.type || "image/jpeg" });
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); }
      catch (e) {
        // Le téléphone demande un nouveau toucher (la photo a mis du temps à arriver) : on propose un bouton
        if (e.name === "NotAllowedError") modal({ title: "Enregistrer la photo", body: "Touchez « Enregistrer », puis choisissez « Enregistrer l'image ».",
          buttons: [{ label: "Annuler" }, { label: "Enregistrer", primary: true, onClick: () => { navigator.share({ files: [file] }).catch(() => {}); } }] });
      }
      return;
    }
    const a = h("a", { href: URL.createObjectURL(file), download: name, style: { display: "none" } });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
    toast("Photo téléchargée");
  } catch { toast("Impossible d'enregistrer la photo"); }
}

/** Après une photo prise avec la caméra dans le navigateur : bouton pour garder l'original (non compressé) sur le téléphone. */
const originalButton = (file, camera, model) => camera && !Native && file
  ? { label: "Enregistrer l'original", onClick: () => { savePhoto(file, photoName(model, Date.now())); return false; } } : null;

/**
 * Prend ou choisit une ou plusieurs photos de cet avion (spotted) et les ajoute à la collection.
 * Un avion ne s'attrape (et ne rapporte des XP) qu'une fois : les photos suivantes du même avion s'ajoutent à son
 * album (10 photos au plus), qui défile en carrousel dans le feed, sans XP en plus. Chaque photo est vérifiée.
 * Galerie : plusieurs photos d'un coup. Caméra : une à la fois, avec « Encore une photo » pour enchaîner.
 */
export async function addPhoto(spotted, { camera, seenAt, files: given } = {}) {
  // given : photos déjà choisies (ex. reçues de l'appareil photo branché par câble, camera.js)
  if (!requireAccount()) return null; // pas de photo en mode invité (photorules.js)
  if (!(await ensurePhotoRules())) return null; // engagement « lieux publics » obligatoire (photorules.js)
  const files = given || [].concat((await pickImage({ capture: !!camera, multiple: !camera })) || []).filter(Boolean);
  if (!files.length) return null;
  const single = files.length === 1, n = files.length;
  const waitText = h("div", "Date, lieu, photo originale et ciel visible.");
  const wait = modal({ title: "Vérification de la photo…", body: waitText, buttons: [] });
  const refused = [];
  let outcome = null, entry = null, added = 0, lastVerdict = null, lastFile = null;
  for (let i = 0; i < n; i++) {
    const file = files[i], label = single ? "la photo" : `photo ${i + 1}`;
    if (!single) waitText.textContent = `Photo ${i + 1} sur ${n} : date, lieu, photo originale et ciel visible.`;
    let blob;
    try { blob = await toJpeg(file); } catch (e) {
      if (single) { wait.close(); await unreadablePhoto(file, e, !!camera); return null; }
      refused.push(`${label} : illisible`); continue;
    }
    // Vérifications automatiques (date, lieu, photo originale, ciel) avant d'accorder des XP
    let verdict = null;
    try { verdict = await verifyPhoto(file, blob, spotted, { camera: !!camera, seenAt: seenAt || Date.now(), own: Collection.prints() }); }
    catch { /* vérification impossible : la photo est acceptée */ }
    const existing = Collection.caughtFor(spotted.hex);
    if (verdict && !verdict.ok) {
      if (!single) { refused.push(`${label} : ${verdict.checks.filter((c) => !c.ok).map((c) => c.detail).join(" ; ")}`); continue; }
      wait.close();
      return rejectedPhoto(spotted, { camera, seenAt, file, blob, verdict, existing });
    }
    const takenAt = camera ? Date.now() : (await exifDate(file)) || seenAt || Date.now();
    if (existing) {
      // Déjà attrapé : la photo rejoint l'album de l'avion, XP inchangés
      try { entry = await addAlbumPhoto(existing, blob, takenAt, verdict); added++; lastVerdict = verdict; lastFile = file; }
      catch (err) { refused.push(err.message); break; } // album complet
    } else {
      outcome = await createCatch(spotted, blob, camera ? "live" : "import", takenAt, verdict);
      entry = outcome.entry; lastVerdict = verdict; lastFile = file;
      await dropRejected(spotted.hex, entry.id);
    }
  }
  wait.close();
  if (!entry) {
    modal({ title: "Aucune photo ajoutée", body: "Aucune des photos choisies n'a été validée :\n" + refused.map((r) => "· " + r).join("\n") });
    return null;
  }
  // Avion attrapé : obturateur + cascade selon la rareté (photo d'album : petite cascade)
  Sound.catch(outcome && outcome.xp.total > 0 ? outcome.xp.rarity.ordinal : 0);
  renderHud();
  const model = entryModel(entry) || entryLabel(entry), total = entryPhotoItems(entry).length, parts = [];
  if (outcome) parts.push(catchMessage(outcome));
  if (added) {
    parts.push(outcome
      ? `+ ${added} autre${added > 1 ? "s" : ""} photo${added > 1 ? "s" : ""} dans l'album de cet avion (sans XP en plus).`
      : `${added > 1 ? `${added} photos rejoignent` : "Ta photo rejoint"} l'album de cet avion (${model} : ${total} photo${total > 1 ? "s" : ""}) : dans le feed, elles défilent ensemble, comme sur Instagram.\n\nUn avion ne rapporte des XP qu'une fois : tes XP pour cet avion (+${entry.xp}) ne changent pas.`);
  }
  if (single && lastVerdict?.ok) parts.push(checksText(lastVerdict));
  if (refused.length) parts.push(`Non ajoutée${refused.length > 1 ? "s" : ""} :\n` + refused.map((r) => "· " + r).join("\n"));
  const title = outcome ? (outcome.xp.total > 0 ? "Avion attrapé !" : "Photo enregistrée")
    : added > 1 ? `${added} photos ajoutées à l'album` : "Photo ajoutée à l'album";
  modal({ title, body: parts.join("\n\n"), buttons: [
    // Caméra : enchaîner les photos pendant que l'avion passe
    camera && total < ALBUM_MAX && { label: "Encore une photo", onClick: () => { addPhoto(spotted, { camera, seenAt }); } },
    single && originalButton(lastFile, camera, model),
    { label: "Partager", onClick: () => shareEntry(entry) },
    { label: "Super", primary: true },
  ].filter(Boolean) });
  afterSync();
  return outcome || { entry, added };
}

const afterSync = () => { if (Supa.isLoggedIn) sync().then((err) => { if (err) toast(`Photo gardée sur l'appareil, envoi plus tard (${err})`); renderHud(); }); };

/** Une ancienne photo non validée du même avion est retirée quand une bonne la remplace. */
async function dropRejected(hex, keepId) {
  for (const old of Collection.forHex(hex).filter((x) => x.rejected && x.id !== keepId)) {
    if (old.remoteId) await Cloud.deleteCatch(old.remoteId, entryPhotoItems(old).map((it) => it.remotePhoto)).catch(() => {});
    await Collection.remove(old.id);
  }
}

/** Photo seule non validée : reprendre / en choisir une autre, la garder sans XP (avion pas encore attrapé), ou annuler. */
async function rejectedPhoto(spotted, { camera, seenAt, file, blob, verdict, existing }) {
  const again = camera ? "Reprendre une photo" : "Choisir une autre photo";
  const choice = await new Promise((res) => modal({ title: "Photo non validée", onClose: () => res("cancel"),
    body: [h("div.kv", checksText(verdict)), h("p.small", { style: { color: "var(--dim)" } }, existing
      ? "Cette photo ne peut pas rejoindre l'album de cet avion. Tu peux en prendre ou en choisir une autre."
      : "Cette photo ne peut pas rapporter d'XP. Tu peux en choisir une autre, ou la garder dans ta collection sans XP.")],
    buttons: [
      { label: again, primary: true, onClick: () => res("again") },
      !existing && { label: "Garder sans XP", onClick: () => res("keep") },
      { label: "Annuler", onClick: () => res("cancel") },
    ].filter(Boolean) }));
  if (choice === "again") return addPhoto(spotted, { camera, seenAt });
  if (choice !== "keep") return null;
  const takenAt = camera ? Date.now() : (await exifDate(file)) || seenAt || Date.now();
  const outcome = await createCatch(spotted, blob, camera ? "live" : "import", takenAt, verdict);
  if (outcome.xp.total > 0) Sound.catch(outcome.xp.rarity.ordinal);
  renderHud();
  modal({ title: "Photo enregistrée", body: catchMessage(outcome), buttons: [{ label: "Super", primary: true }] });
  afterSync();
  return outcome;
}

/** La photo n'a pas pu être lue : explication selon la cause probable, et détails pour le dépannage. */
async function unreadablePhoto(file, err, camera) {
  const kind = await imageKind(file), mo = (file.size / 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 1 });
  const why = file.size === 0 || kind === "vide"
    ? "Le téléphone n'a pas transmis la photo (fichier vide). C'est fréquent avec une photo restée seulement dans le cloud (Google Photos, iCloud) : ouvre-la d'abord dans la galerie pour qu'elle se télécharge, puis réessaie."
    : kind === "heic"
      ? "La photo est au format HEIC (« haute efficacité »), que ce téléphone ne sait pas lire dans Plane GO. Dans les réglages de l'appareil photo, choisis le format JPEG (ou « Le plus compatible » sur iPhone), ou prends la photo avec la caméra de Plane GO."
      : "Ce téléphone n'a pas réussi à ouvrir cette photo. Réessaie, ou choisis une autre photo.";
  modal({ title: "Impossible de lire cette photo", body: [h("p", why),
    h("p.small.dim", `Détails pour le dépannage : ${camera ? "caméra" : "galerie"} · format ${kind}${file.type ? ` (${file.type})` : ""} · ${mo} Mo · ${err?.details?.join(" / ") || err?.message || "erreur inconnue"}`)] });
}

/** Petit badge « 3 photos » sur la vignette d'un avion qui a un album (sinon null). */
export function albumBadge(e) {
  const n = entryPhotoItems(e).length;
  return n > 1 ? h("span.album-count", { title: `${n} photos de cet avion` }, icon("image", 13), String(n)) : null;
}

/** Vignettes de mes photos (touchez pour la fiche de la photo). */
export function photoStrip(entries, { onChange } = {}) {
  return h("div.photo-strip", entries.map((e) => {
    const img = h("img", { alt: "Ma photo", loading: "lazy" });
    entryPhoto(e).then((u) => { if (u) img.src = u; });
    const r = entryRarity(e);
    return h("button.ps-item", { style: { borderColor: e.rejected ? "var(--red)" : "" }, onclick: () => showEntry(e, { onChange }) },
      img, albumBadge(e), h("span", e.rejected ? "non validée" : `${dateDay(e.takenAt)} · +${e.xp} XP`));
  }));
}

export function sightingLabel(s) {
  const d = s.spotted.distanceKm != null ? ` · ${Math.round(s.spotted.distanceKm)} km` : "";
  const xp = computeXp(s.spotted, { hasModel: Collection.hasModel, countForHex: Collection.countForHex }).total;
  return `${spottedRarity(s.spotted).stars} ${s.label}\n${dateTime(s.seenAt)}${d} · ${xp} XP`;
}

/** « Ajouter une photo d'appareil photo » : choisir l'avion passé cette semaine, puis la photo. */
export async function importFlow() {
  if (!requireAccount()) return; // pas de photo en mode invité
  const caught = Collection.hexes();
  const list = Sightings.recent().sort((a, b) => caught.has(a.spotted.hex) - caught.has(b.spotted.hex));
  if (!list.length) {
    modal({ title: "Aucun avion cette semaine", body: `Seuls les avions passés cette semaine à moins de ${MAX_PHOTO_KM} km de vous, pendant que le radar tournait, peuvent recevoir une photo (la liste repart à zéro chaque lundi à 0 h, avec le concours photo). Laissez le radar actif pendant vos sessions de spotting.` });
    return;
  }
  const i = await choose("Quel avion avez-vous photographié ?",
    list.map((s) => sightingLabel(s) + (caught.has(s.spotted.hex) ? "\nDéjà attrapé : tes photos s'ajoutent à son album (XP inchangés)" : "")));
  if (i >= 0) await addPhoto(list[i].spotted, { seenAt: list[i].seenAt });
}

/** Demande la source de la photo (appareil photo / galerie ou caméra du téléphone). */
export async function askPhotoSource(s) {
  const xp = computeXp(s.spotted, { hasModel: Collection.hasModel, countForHex: Collection.countForHex });
  return new Promise((resolve) => {
    const caught = Collection.caughtFor(s.spotted.hex);
    modal({ title: s.label, body: (caught ? `Déjà attrapé : tes nouvelles photos s'ajoutent à son album (${entryPhotoItems(caught).length}/${ALBUM_MAX}), sans XP en plus. Elles défilent ensemble dans le feed.`
      : `${xp.zeroReason ? xp.zeroReason + "\n" : ""}${xp.total} XP à gagner`) + "\n\nD'où vient votre photo ?", onClose: () => resolve(null),
      buttons: [
        { label: "Caméra", onClick: async () => resolve(await addPhoto(s.spotted, { camera: true, seenAt: s.seenAt })) },
        { label: "Appareil photo / galerie", primary: true, onClick: async () => resolve(await addPhoto(s.spotted, { seenAt: s.seenAt })) },
      ] });
  });
}

/**
 * Carrousel de photos, comme sur Instagram : on fait glisser du doigt (flèches à la souris, touches ← →), compteur « 2/5 »
 * et points sur la photo. Cadre aux proportions de la première photo (entre 4:5 et 1,91:1).
 * urls : adresses (ou promesses d'adresse) dans l'ordre ; fit : "cover" (feed, photo recadrée) ou "contain" (photo entière) ;
 * onTap(i) : toucher la photo ; onChange(i) : photo affichée. el.index() = n° de la photo affichée.
 */
export function carousel(urls, { alt = "Photo de l'avion", fit = "cover", onTap, onChange } = {}) {
  const n = urls.length;
  const imgs = urls.map((_, i) => h("img", { alt: n > 1 ? `${alt} (${i + 1} sur ${n})` : alt, draggable: "false" }));
  const track = h("div.car-track", { tabindex: n > 1 ? "0" : null }, imgs.map((img) => h("div.car-slide", img)));
  const el = h(`div.carousel.${fit}`, track);
  const loaded = new Set();
  const load = (i) => {
    if (i < 0 || i >= n || loaded.has(i)) return;
    loaded.add(i);
    Promise.resolve(urls[i]).then((u) => { if (u) imgs[i].src = u; else imgs[i].classList.add("missing"); });
  };
  // Proportions du cadre : celles de la première photo
  imgs[0]?.addEventListener("load", () => {
    const { naturalWidth: w, naturalHeight: hh } = imgs[0];
    if (w && hh) track.style.aspectRatio = String(Math.max(0.8, Math.min(1.91, w / hh)));
  }, { once: true });
  let cur = 0;
  el.index = () => cur;
  if (onTap) track.addEventListener("click", () => onTap(cur));
  // Première photo : chargée quand la publication approche de l'écran ; la suivante, juste après
  const seen = () => { load(cur); load(cur + 1); };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { seen(); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
  } else seen();
  if (n < 2) return el;
  const show = (i) => track.scrollTo({ left: Math.max(0, Math.min(n - 1, i)) * track.clientWidth, behavior: "smooth" });
  const count = h("span.car-count"), dots = h("div.car-dots", urls.map(() => h("i")));
  const nav = (cls, label, d) => h(`button.car-nav.${cls}`, { type: "button", "aria-label": label, onclick: (ev) => { ev.stopPropagation(); show(cur + d); } },
    h("span", { html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}"/></svg>` }));
  const prev = nav("prev", "Photo précédente", -1), next = nav("next", "Photo suivante", 1);
  el.append(count, dots, prev, next);
  const mark = () => {
    count.textContent = `${cur + 1}/${n}`;
    [...dots.children].forEach((d, i) => d.classList.toggle("on", i === cur));
    prev.disabled = cur === 0; next.disabled = cur === n - 1;
  };
  let raf = 0;
  track.addEventListener("scroll", () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const i = Math.max(0, Math.min(n - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));
      load(i - 1); load(i); load(i + 1);
      if (i !== cur) { cur = i; mark(); onChange?.(i); }
    });
  }, { passive: true });
  track.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") { ev.preventDefault(); ev.stopPropagation(); show(cur + (ev.key === "ArrowLeft" ? -1 : 1)); }
  });
  mark();
  return el;
}

/** Infos de vol d'une capture (pour vérifier de nouvelles photos du même avion quand son passage n'est plus dans la liste). */
const entrySpotted = (e) => ({ hex: e.hex, type: e.type, model: e.model, callsign: e.callsign, registration: e.registration,
  military: e.military, operator: e.operator, countryIso: e.countryIso, countryName: e.countryName, route: e.route,
  flightKm: e.flightKm, distanceKm: e.distanceKm });

/**
 * Ajouter des photos à l'album d'un avion déjà attrapé (sans XP en plus). Comme la première, chaque photo doit avoir été
 * prise pendant le passage de l'avion : celui de cette semaine s'il est dans la liste, sinon celui de la première photo.
 */
export function morePhotos(e, { onChange } = {}) {
  const s = Sightings.recent().filter((x) => x.spotted.hex === e.hex).sort((a, b) => b.seenAt - a.seenAt)[0];
  const spotted = s?.spotted || entrySpotted(e), seenAt = s?.seenAt || e.takenAt, n = entryPhotoItems(e).length;
  const pick = async (camera) => { await addPhoto(spotted, { camera, seenAt }); onChange?.(); };
  modal({ title: "Ajouter des photos", body: `Album de cet avion : ${n}/${ALBUM_MAX} photos.\n\nTes nouvelles photos sont vérifiées comme la première (prises pendant le passage de l'avion, ciel visible…) et défilent avec elle dans le feed. Un avion ne rapporte des XP qu'une fois : pas d'XP en plus.\n\nD'où viennent tes photos ?`,
    buttons: [
      { label: "Caméra", onClick: () => { pick(true); } },
      { label: "Galerie (plusieurs d'un coup)", primary: true, onClick: () => { pick(false); } },
    ] });
}

/** Fiche d'une capture de la collection : ses photos en carrousel (album du même avion), infos et vérifications. */
export async function showEntry(e, { onChange } = {}) {
  e = Collection.get(e.id) || e;
  const items = entryPhotoItems(e), n = items.length;
  const r = entryRarity(e);
  const reopen = () => { const fresh = Collection.get(e.id); if (fresh) showEntry(fresh, { onChange }); };
  let m = null, cur = 0;
  const car = carousel(items.map((it) => entryPhoto(it)), { fit: "contain", onChange: (i) => { cur = i; paint(); } });
  const about = h("div.small.dim"), tools = h("div.row.album-tools");
  const checks = h("div.kv");
  const lines = [
    e.rejected ? `PHOTO NON VALIDÉE — ${r.stars} ${r.label} — 0 XP` : `ATTRAPÉ — ${r.stars} ${r.label} — ${e.xp} XP${e.newModel ? " (nouveau modèle)" : ""}`, entryModel(e),
    e.registration && `Immatriculation : ${e.registration}`, e.callsign && `Indicatif : ${e.callsign}`,
    e.operator && `Opérateur : ${e.operator}`, e.countryName && `Pays : ${flagOf(e.countryIso)} ${e.countryName}`,
    e.route && `Trajet : ${e.route}`,
    e.flightKm != null && `Distance du vol : ${Math.round(e.flightKm).toLocaleString(LOCALE)} km (${distanceBonus(e.flightKm).label})`,
    e.distanceKm != null && `Distance à la prise de vue : ${dec(e.distanceKm)} km`,
    e.source === "import" && "Photo ajoutée après coup",
    e.remoteId ? (e.albumPending ? "Sauvegardée sur le compte (dernières modifications de l'album en attente d'envoi)" : "Sauvegardée sur le compte") : "Sur cet appareil uniquement",
  ].filter(Boolean);
  // Infos de la photo affichée : date, vérification, et (album) photo principale / retirer
  function paint() {
    const it = items[cur], t = cur === 0 ? e.takenAt : it.takenAt;
    about.textContent = (n > 1 ? `Photo ${cur + 1} sur ${n}${cur === 0 ? " (principale)" : ""} · ` : "") + (t ? `Photographié le ${dateTime(t)}` : "");
    checks.textContent = it.checks ? "Vérification de la photo :\n" + checksText(it) : "";
    tools.replaceChildren(...[
      !e.rejected && n < ALBUM_MAX && h("button.btn.small.outline", { title: "Ajouter des photos de cet avion (sans XP en plus)", onclick: () => { m?.close(); morePhotos(e, { onChange }); } },
        icon("camera", 16), " Ajouter"),
      n > 1 && cur > 0 && h("button.btn.small.outline", { onclick: () => {
        setMainEntryPhoto(e, cur); toast("Photo principale changée"); afterSync(); onChange?.(); m?.close(); reopen();
      } }, "Photo principale"),
      n > 1 && h("button.btn.small.outline", { onclick: async () => {
        if (!(await confirmBox("Retirer cette photo de l'album ?" + (e.remoteId ? "\n\nElle disparaîtra aussi du feed." : "") + "\n\nTes XP ne changent pas.", "Retirer", true))) return;
        try { await removeEntryPhoto(e, cur); } catch (err) { toast(err.message); return; }
        afterSync(); onChange?.(); m?.close(); reopen();
      } }, icon("trash", 16), " Retirer"),
    ].filter(Boolean));
    tools.style.display = tools.childElementCount ? "" : "none";
  }
  paint();
  m = modal({ title: entryLabel(e), body: [car, about, tools, h("div.kv.mt", lines.join("\n")), checks], buttons: [
    { label: "Supprimer", danger: true, onClick: async () => {
      const what = n > 1 ? `cet avion, ses ${n} photos` : "cette photo";
      const ok = await confirmBox(`Supprimer ${what} et ses ${e.xp} XP ?${e.remoteId ? "\n\nElle sera aussi retirée de votre compte et du feed." : ""}`, "Supprimer", true);
      if (!ok) return false;
      try {
        if (e.remoteId) await Cloud.deleteCatch(e.remoteId, entryPhotoItems(Collection.get(e.id) || e).map((it) => it.remotePhoto));
        await Collection.remove(e.id);
      } catch (err) { toast("Suppression impossible : " + err.message); }
      renderHud(); onChange?.();
    } },
    { label: "Wikipédia", onClick: () => showWiki(wikiQuery.entry(e)) },
    { label: "Enregistrer", onClick: async () => {
      const u = await entryPhoto(items[cur]);
      if (u) savePhoto(u, photoName(entryModel(e), (cur === 0 ? e.takenAt : items[cur].takenAt) || e.takenAt)); else toast("Photo introuvable");
      return false;
    } },
    { label: "Partager", primary: true, onClick: () => shareEntry(e) },
  ] });
}

// ---------- Partage ----------
export function shareMessage({ mine, player, model, rarity, xp, route, military }) {
  const what = (model ? `un ${model}` : "un avion") + (military ? " militaire" : "");
  let s = mine ? `Je viens d'attraper ${what} avec Plane GO !` : `Regarde : ${player || "un ami"} a attrapé ${what} sur Plane GO !`;
  s += `\n${rarity.stars} ${rarity.label}${xp > 0 ? ` · +${xp} XP` : ""}`;
  if (route) s += `\n${route}`;
  s += `\n\nToi aussi, essaie d'attraper des avions ! Lève les yeux, scanne le ciel et viens me défier${mine && player ? ` (mon pseudo : ${player})` : ""} `;
  return s + `\n${location.origin}${location.pathname}`;
}

export async function share(text, photoUrl) {
  if (Native) {
    // Appli Android : menu de partage natif ; une photo locale est transmise en base64
    let img = photoUrl && /^https?:/.test(photoUrl) ? photoUrl : null;
    if (photoUrl && photoUrl.startsWith("blob:")) {
      try {
        const blob = await fetch(photoUrl).then((r) => r.blob());
        img = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
      } catch { img = null; }
    }
    try { Native.share(text, img); return; } catch { /* ancienne version : partage web */ }
  }
  try {
    let files;
    if (photoUrl) {
      const blob = await fetch(photoUrl).then((r) => r.blob()).catch(() => null);
      if (blob) files = [new File([blob], "plane-go.jpg", { type: "image/jpeg" })];
    }
    if (files && navigator.canShare?.({ files, text })) return await navigator.share({ files, text });
    if (navigator.share) return await navigator.share({ text });
    await navigator.clipboard.writeText(text);
    toast("Message copié : collez-le dans WhatsApp, Messenger…");
  } catch (e) { if (e?.name !== "AbortError") toast("Partage impossible"); }
}

export async function shareEntry(e) {
  share(shareMessage({ mine: true, player: Player.profile?.username, model: entryModel(e), rarity: entryRarity(e),
    xp: e.xp, route: e.route, military: e.military }), await entryPhoto(e));
}

// ---------- Installation ----------
// L'appli Android est servie par le site lui-même (déposée par le workflow « Compiler l'appli Android »)
export const APK_URL = APK_HOME + "PlaneGO.apk"; // copie GitHub du site (voir config.js)

/**
 * Encadré « Installer Plane GO » (rien si l'appli est déjà installée).
 * dismissible : bouton « Plus tard » qui le masque définitivement (Feed).
 */
export function installCard({ dismissible = false } = {}) {
  if (isStandalone()) return null;
  if (dismissible && localStorage.getItem("install_hidden2")) return null;
  const btns = h("div.row.mt", { style: { flexWrap: "wrap" } });
  const how = h("div.small");
  const card = h("div.card.pad.install", { style: { marginBottom: "12px" } }, h("div", { style: { fontWeight: 800 } }, "Installer Plane GO"), how, btns);
  const hide = () => { localStorage.setItem("install_hidden2", "1"); card.remove(); };
  const render = () => {
    if (isStandalone() || Native) { card.remove(); return; } // déjà dans l'appli Android : rien à installer
    how.textContent = isIos()
      ? "Sur iPhone : touchez le bouton Partager en bas de Safari, puis « Sur l'écran d'accueil »."
      : isAndroid()
        ? (install.prompt ? "Touchez « Installer » pour ajouter Plane GO à votre écran d'accueil."
          : "Dans Chrome : menu ⋮ en haut à droite › « Ajouter à l'écran d'accueil » › « Installer ». Samsung Internet : menu ☰ › « Ajouter la page à » › « Écran d'accueil ».")
          + "\nPour que le radar continue écran éteint, prenez plutôt l'appli Android."
        : "Dans Chrome ou Edge : icône d'installation dans la barre d'adresse, ou menu › « Installer Plane GO ».";
    btns.replaceChildren(...[
      install.prompt && h("button.btn.primary.small", { onclick: async () => {
        const p = install.prompt; install.prompt = null;
        p.prompt();
        const r = await p.userChoice.catch(() => null);
        if (r?.outcome === "accepted") card.remove(); else render();
      } }, "Installer la version web"),
      isAndroid() && h("a.btn.amber.small", { href: APK_URL, style: { textDecoration: "none" } }, "Appli Android (radar écran éteint)"),
      dismissible && h("button.btn.small.outline", { onclick: hide }, "Plus tard"),
    ].filter(Boolean));
  };
  window.addEventListener("planego-installable", render);
  window.addEventListener("planego-installed", () => card.remove());
  render();
  return card;
}

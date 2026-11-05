// Appareil photo branché par câble USB (OTG) à l'appli Android, en mode « PC à distance » (Sony Alpha) :
// chaque photo prise arrive dans Plane GO, qui propose l'avion passé à ce moment-là pour la ranger dans la collection.
// Côté appli : CameraUsb.kt (protocole PTP + Sony), photos servies à l'adresse /__camera/<id>.jpg (MainActivity).
import { h, modal, toast, choose, exifInfo, dateTime, icon } from "./util.js";
import { Native } from "./native.js";
import { Sightings } from "./store.js";
import { addPhoto, sightingLabel } from "./ui.js";

const listeners = new Set();
const BEFORE_MS = 4 * 3600e3, AFTER_MS = 75 * 60e3; // comme verify.js : photo de 1 h 15 avant à 4 h après le passage

export const Camera = {
  /** L'appli Android sait-elle parler à un appareil photo (version 1.17 et plus) ? */
  available: () => typeof Native?.cameraState === "function",
  state() {
    try { return JSON.parse(Native.cameraState()); } catch { return { state: "idle", message: "", model: "", photos: [] }; }
  },
  log() { try { return Native.cameraLog() || ""; } catch { return ""; } },
  retry() { try { Native.cameraRetry(); } catch { /* ancienne version */ } },
  done(id) { try { Native.cameraDone(id); } catch { /* ancienne version */ } },
  /** Photo ratée : supprimée de l'appli et de la galerie (appli 1.20+ ; avant, seulement écartée). */
  remove(id) {
    handed.delete(id);
    try { if (typeof Native.cameraDelete === "function") Native.cameraDelete(id); else Native.cameraDone(id); } catch { /* ancienne version */ }
  },
  pending() { return (Camera.state().photos || []).filter((p) => !p.done); },
  url: (id, thumb = false) => `/__camera/${id}${thumb ? "_t" : ""}.jpg`,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/**
 * Fiche d'un avion ouverte (aircraft.js) : elle « réclame » les photos qui arrivent, pour les ajouter directement à cet
 * avion, sans bandeau ni choix. claimPhotos(fn) renvoie la fonction qui rend la main.
 */
let claimer = null;
const handed = new Set(); // photos déjà confiées à une fiche
export function claimPhotos(fn) {
  claimer = fn;
  return () => { if (claimer === fn) claimer = null; };
}

/** Écart d'horloge de l'appareil (ms, date EXIF − arrivée), mesuré sur la dernière photo ; null si inconnu. */
let clockSkew = null;

window.addEventListener("planego-camera", (e) => {
  listeners.forEach((fn) => fn(e.detail));
  if (e.detail === "photo") arrived();
});

/** Nouvelle photo : bandeau en bas de l'écran avec la vignette et « Ranger ». */
async function arrived() {
  const pend = Camera.pending();
  const p = pend[0];
  if (!p) return;
  if (claimer) {
    const fresh = pend.filter((x) => !handed.has(x.id));
    fresh.forEach((x) => handed.add(x.id));
    if (fresh.length) claimer(fresh.reverse()); // dans l'ordre de prise de vue
    return;
  }
  const file = await photoFile(p).catch(() => null);
  if (file) {
    const shot = (await exifInfo(file)).date;
    if (shot) clockSkew = shot - p.receivedAt;
    listeners.forEach((fn) => fn("skew"));
  }
  document.querySelector(".cam-banner")?.remove();
  const bar = h("div.cam-banner", { role: "status" },
    h("img", { src: Camera.url(p.id, true), alt: "" }),
    h("div.grow", h("b", "Nouvelle photo de l'appareil"), h("div.small.dim", p.name)),
    h("button.btn.primary.small", { onclick: () => { bar.remove(); classify(p); } }, "Ranger"),
    h("button.btn.outline.small", { "aria-label": "Fermer", onclick: () => bar.remove() }, "Plus tard"));
  document.body.append(bar);
  setTimeout(() => bar.remove(), 12000);
}

export async function photoFile(p) {
  const r = await fetch(Camera.url(p.id), { cache: "no-store" });
  if (!r.ok) throw new Error("photo introuvable");
  return new File([await r.blob()], p.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: p.receivedAt });
}

/** Ranger une photo : choisir l'avion passé au moment de la prise de vue, puis vérification habituelle (addPhoto). */
export async function classify(p) {
  let file;
  try { file = await photoFile(p); } catch { toast("Photo introuvable sur le téléphone"); return; }
  const shot = (await exifInfo(file)).date || p.receivedAt;
  const list = Sightings.recent()
    .filter((s) => shot >= s.seenAt - AFTER_MS && shot <= s.seenAt + BEFORE_MS)
    .sort((a, b) => Math.abs(a.seenAt - shot) - Math.abs(b.seenAt - shot))
    .slice(0, 8);
  if (!list.length) {
    modal({ title: "Aucun avion à ce moment-là", body: `La photo a été prise le ${dateTime(shot)}. Aucun avion n'est passé à moins de 30 km de toi autour de cette heure pendant que le radar tournait.\n\nLaisse le radar démarré pendant tes séances photo. Si l'heure de l'appareil est fausse, règle-la (MENU › Réglages › Réglage date/heure).`,
      buttons: [{ label: "Écarter la photo", onClick: () => { Camera.done(p.id); } }, { label: "Fermer", primary: true }] });
    return;
  }
  const i = await choose("Quel avion as-tu photographié ?", list.map((s) => {
    const min = Math.round(Math.abs(s.seenAt - shot) / 60000);
    return sightingLabel(s) + `\nPassé ${min < 1 ? "au moment de la photo" : `${min} min ${s.seenAt < shot ? "avant" : "après"} la photo`}`;
  }));
  if (i < 0) return;
  const res = await addPhoto(list[i].spotted, { files: [file], seenAt: list[i].seenAt });
  if (res) Camera.done(p.id);
}

/**
 * Petit bouton « prise USB » en haut à droite du Scanner (appli Android seulement) : pastille verte quand l'appareil
 * est prêt, nombre de photos à ranger ; toucher ouvre la fenêtre avec l'état, les photos, l'aide et le journal.
 */
export function cameraButton() {
  if (!Camera.available()) return null;
  const badge = h("span.cam-badge");
  const btn = h("button.cam-btn", { type: "button", onclick: openCamera }, icon("usb", 18), badge);
  const render = () => {
    const st = Camera.state(), pend = (st.photos || []).filter((p) => !p.done).length;
    btn.classList.toggle("ready", st.state === "ready");
    btn.classList.toggle("err", st.state === "error");
    badge.textContent = pend ? String(pend) : "";
    const label = `Appareil photo par câble : ${st.state === "ready" ? "connecté" : st.state === "error" ? "erreur" : "non branché"}${pend ? `, ${pend} photo${pend > 1 ? "s" : ""} à ranger` : ""}`;
    btn.title = label; btn.setAttribute("aria-label", label);
  };
  const unsub = Camera.subscribe(render);
  render();
  btn.cleanup = unsub;
  return btn;
}

/**
 * Vignette d'une photo de l'appareil : toucher = la voir en grand, croix = la supprimer (photo ratée).
 * label : petite étiquette en bas (ex. « Vérification… »), sans croix pendant ce temps.
 */
export function liveThumb(p, { label = "", onDelete, onOpen } = {}) {
  const el = h("div.cam-thumb.cam-live", { title: p.name },
    h("img", { src: Camera.url(p.id, true), alt: p.name, onclick: () => (onOpen ? onOpen(p) : viewPhoto(p, onDelete)) }),
    label && h("span.cam-label", label),
    !label && onDelete && h("button.cam-del", { type: "button", "aria-label": `Supprimer ${p.name}`,
      onclick: (e) => { e.stopPropagation(); onDelete(p); } }, "×"));
  return el;
}

/** Photo en grand, avec « Supprimer ». */
export function viewPhoto(p, onDelete) {
  modal({ title: p.name, wide: true, body: h("img.cam-big", { src: Camera.url(p.id), alt: p.name }), buttons: [
    onDelete && { label: "Supprimer", danger: true, onClick: () => { onDelete(p); } },
    { label: "Fermer", primary: true },
  ].filter(Boolean) });
}

/** Fenêtre « Appareil photo (câble) » : état, photos à ranger, réglages de l'appareil, Réessayer, Journal. */
function openCamera() {
  const status = h("div.small"), help = h("div.small.dim.mt"), skew = h("div.small.cam-warn");
  const thumbs = h("div.cam-thumbs");
  let m = null;
  const render = () => {
    const st = Camera.state();
    status.textContent = st.message || "Branche ton appareil photo avec un câble USB OTG.";
    status.className = "small" + (st.state === "ready" ? " cam-ok" : st.state === "error" ? " cam-err" : "");
    help.textContent = st.state === "ready" ? ""
      : "Sur l'appareil : MENU › Réglages › Connexion USB › PC à distance, et enregistrement en JPEG (ou RAW + JPEG). Puis branche le câble USB OTG (micro-USB vers USB-C).";
    const minutes = clockSkew != null ? Math.round(clockSkew / 60000) : 0;
    skew.textContent = Math.abs(minutes) >= 3
      ? `L'horloge de l'appareil a ${Math.abs(minutes)} min ${minutes > 0 ? "d'avance" : "de retard"} : règle-la (MENU › Réglages › Réglage date/heure), sinon les photos seront refusées.` : "";
    const pend = (st.photos || []).filter((p) => !p.done);
    thumbs.replaceChildren(...pend.slice(0, 12).map((p) =>
      liveThumb(p, { onOpen: () => { m?.close(); classify(p); }, onDelete: (x) => { Camera.remove(x.id); toast("Photo supprimée"); } })));
    if (pend.length) thumbs.prepend(h("div.small.dim.cam-count", `${pend.length} photo${pend.length > 1 ? "s" : ""} à ranger (toucher pour choisir l'avion, × pour supprimer)`));
  };
  const unsub = Camera.subscribe(render);
  render();
  m = modal({ title: "Appareil photo (câble)", body: [status, skew, thumbs, help], onClose: unsub, buttons: [
    { label: "Journal", onClick: () => { showLog(); return false; } },
    { label: "Réessayer", onClick: () => { Camera.retry(); toast("Recherche de l'appareil…"); return false; } },
    { label: "Fermer", primary: true },
  ] });
}

function showLog() {
  const text = Camera.log() || "(journal vide)";
  modal({ title: "Journal de l'appareil photo", wide: true,
    body: [h("p.small.dim", "Pour la mise au point : copie ce journal et envoie-le s'il y a un souci."), h("pre.cam-log", text)],
    buttons: [{ label: "Copier", onClick: () => { navigator.clipboard?.writeText(text).then(() => toast("Journal copié")).catch(() => toast("Copie impossible")); return false; } },
      { label: "Fermer", primary: true }] });
}

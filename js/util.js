// Petits outils partagés : DOM, formats, géographie, fenêtres et messages.

export const $ = (sel, root = document) => root.querySelector(sel);

/** Crée un élément : h("div.card", {onclick}, "texte", enfant…) */
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "html") el.innerHTML = v;
    else if (k in el && k !== "list") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Rareté en barres (1 à 5, couleur de la rareté) suivie d'un libellé : « ▮▮▮▯▯ Rare · 60 XP ». */
export function rarityMark(r, text) {
  const n = (r?.ordinal ?? 0) + 1;
  return h("span.rmark", { style: { color: r?.color } },
    h("span.rbars", { "aria-hidden": "true" }, [1, 2, 3, 4, 5].map((i) => h("i" + (i <= n ? ".on" : "")))),
    h("span.rl", text ?? r?.label ?? ""));
}

// Icônes au trait (style « Instrument »), en SVG de la couleur du texte : onglets et petits boutons
const ICONS = {
  // Manette (onglet Jeux)
  games: '<path d="M7.5 8h9a4.5 4.5 0 0 1 4.4 5.4l-.7 3.4a2.3 2.3 0 0 1-3.9 1.1L14 15.5h-4l-2.3 2.4a2.3 2.3 0 0 1-3.9-1.1l-.7-3.4A4.5 4.5 0 0 1 7.5 8z"/><path d="M8 10.5v3M6.5 12h3"/><path d="M15.5 11.5h.01M17.5 13h.01"/>',
  // Information (bouton « i » du Scanner)
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  map: '<path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5h.01"/>',
  // Prise USB (appareil photo branché par câble)
  usb: '<circle cx="12" cy="20" r="1.6"/><path d="M12 18.4V3.5"/><path d="M9.5 6 12 3.5 14.5 6"/><path d="M12 14.5l-4.5-3V9"/><circle cx="7.5" cy="8" r="1.1"/><path d="M12 12.5l4.5-3V7.5"/><path d="M15.4 6.4h2.2v2.2h-2.2z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  feed: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/>',
  collection: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/>',
  comment: '<path d="M5 5h14v10H9l-4 4z"/>',
  share: '<path d="M12 4v11M7 9l5-5 5 5M5 14v6h14v-6"/>',
  flag: '<path d="M6 21V4h11l-2 4 2 4H6"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 15l-5-5-8 9"/>',
  plane: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
};
/**
 * Curseur à crans qui ne bouge qu'en faisant glisser son rond : un toucher sur la barre ne change rien (pas de saut
 * par erreur, juste un petit rappel `hint`). La valeur suit le déplacement depuis l'endroit où l'on a posé le doigt.
 * count : nombre de crans (0 à count − 1) ; value : cran de départ ; onInput(i) pendant le glissement ; onChange(i)
 * au lâcher (seulement si la valeur a changé). Clavier : flèches, Début, Fin.
 */
export function dragSlider({ count, value = 0, label = "", valueText, hint, onInput, onChange }) {
  let cur = value, drag = null, hintTimer = 0;
  const fill = h("div.ds-fill");
  const thumb = h("button.ds-thumb", { type: "button", role: "slider", "aria-label": label, "aria-valuemin": "0",
    "aria-valuemax": String(count - 1) }, h("span.ds-dot"));
  const el = h("div.drag-slider", h("div.ds-track", fill), thumb);
  const pct = (i) => (count > 1 ? (i / (count - 1)) * 100 : 0);
  const paint = () => {
    thumb.style.left = fill.style.width = `${pct(cur)}%`;
    thumb.setAttribute("aria-valuenow", String(cur));
    thumb.setAttribute("aria-valuetext", valueText ? valueText(cur) : String(cur));
  };
  const set = (i) => {
    i = Math.max(0, Math.min(count - 1, Math.round(i)));
    if (i !== cur) { cur = i; paint(); onInput?.(i); }
  };
  thumb.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try { thumb.setPointerCapture(e.pointerId); } catch { /* ancien navigateur */ }
    drag = { x: e.clientX, from: cur, step: (el.getBoundingClientRect().width || 1) / Math.max(1, count - 1) };
    el.classList.add("dragging");
  });
  thumb.addEventListener("pointermove", (e) => { if (drag) set(drag.from + (e.clientX - drag.x) / drag.step); });
  const end = () => {
    if (!drag) return;
    const changed = cur !== drag.from;
    drag = null; el.classList.remove("dragging");
    if (changed) onChange?.(cur);
  };
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => thumb.addEventListener(t, end));
  // Toucher la barre plutôt que le rond : rien ne change, rappel « fais glisser le rond »
  el.addEventListener("pointerdown", (e) => {
    if (thumb.contains(e.target) || !hint) return;
    hint.classList.add("on"); clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove("on"), 1800);
  });
  thumb.addEventListener("keydown", (e) => {
    const to = { ArrowLeft: cur - 1, ArrowDown: cur - 1, ArrowRight: cur + 1, ArrowUp: cur + 1, Home: 0, End: count - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const before = cur; set(to);
    if (cur !== before) onChange?.(cur);
  });
  paint();
  return el;
}

/** Icône au trait : icon("radar", 22). Décorative (masquée aux lecteurs d'écran) : mettre un aria-label sur le bouton. */
export function icon(name, size = 20) {
  const s = document.createElement("span");
  s.className = "ico";
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  return s;
}

const nf = new Intl.NumberFormat("fr-FR");
export const num = (n) => nf.format(Math.round(n));
export const dec = (n, d = 1) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function timeAgo(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export const dateTime = (ms) => new Date(ms).toLocaleString("fr-FR",
  { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const dateDay = (ms) => new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** « 500 m », « 2 km », « 7,5 km » */
export const meters = (m) => (m < 1000 ? `${m} m` : m % 1000 === 0 ? `${m / 1000} km` : `${dec(m / 1000)} km`);

export const article = (model) => (model ? `un ${model}` : "un avion");

// ---------- Géographie ----------
const R_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const DIRS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
export const cardinal = (deg) => DIRS[Math.round(deg / 45) % 8];
const DIR_NAMES = ["au nord", "au nord-est", "à l'est", "au sud-est", "au sud", "au sud-ouest", "à l'ouest", "au nord-ouest"];
/** « au nord-est », « à l'ouest »… pour un cap en degrés (0 = nord, 90 = est). */
export const direction = (deg) => DIR_NAMES[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

// ---------- Messages et fenêtres ----------
export function toast(msg, ms = 3500) {
  const t = h("div.toast", msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, ms);
}

/**
 * Fenêtre modale. buttons : [{label, primary?, danger?, onClick?(close) → false pour rester ouverte}]
 * Renvoie { close, el }.
 */
/**
 * Petit bouton « i » qui ouvre une fenêtre d'explication : les longs textes ne prennent plus de place à l'écran.
 * body = texte, liste de paragraphes, ou fonction qui les renvoie (texte calculé au moment du toucher).
 * small = version discrète à placer dans une ligne (titre de section, interrupteur).
 */
export function infoButton(title, body, { small = false } = {}) {
  return h("button.cam-btn" + (small ? ".info-sm" : ""), { type: "button", "aria-label": title, title,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); modal({ title, body: typeof body === "function" ? body() : body }); } },
    icon("info", small ? 15 : 18));
}

export function modal({ title, body, buttons = [{ label: "OK", primary: true }], onClose, wide }) {
  const back = h("div.modal-back");
  const box = h("div.modal" + (wide ? ".wide" : ""), { role: "dialog", "aria-modal": "true" });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true; back.remove(); document.removeEventListener("keydown", onKey); onClose?.();
  };
  // Ordinateur : la touche Échap ferme la fenêtre du dessus
  const onKey = (e) => { if (e.key === "Escape" && [...document.querySelectorAll(".modal-back")].at(-1) === back) close(); };
  document.addEventListener("keydown", onKey);
  if (title) box.append(h("h2.modal-title", title));
  const content = h("div.modal-body");
  if (body) content.append(...[].concat(body).map((b) => (b instanceof Node ? b : h("p", b))));
  box.append(content);
  if (buttons.length) {
    box.append(h("div.modal-actions", buttons.map((b) =>
      h("button.btn" + (b.primary ? ".primary" : "") + (b.danger ? ".danger" : ""), {
        onclick: async () => { if ((await b.onClick?.(close)) !== false) close(); },
      }, b.label))));
  }
  back.append(box);
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return { close, el: box, content };
}

export const confirmBox = (message, okLabel = "OK", danger = false) => new Promise((resolve) => {
  modal({
    body: message, onClose: () => resolve(false),
    buttons: [{ label: "Annuler" }, { label: okLabel, primary: !danger, danger, onClick: () => { resolve(true); } }],
  });
});

/** Liste de choix (comme un menu) ; renvoie l'index choisi ou -1. */
export const choose = (title, items, cancel = "Annuler") => new Promise((resolve) => {
  let done = false;
  const m = modal({
    title, buttons: [{ label: cancel }], onClose: () => { if (!done) resolve(-1); },
    body: h("div.choice-list", items.map((it, i) => h("button.choice", {
      onclick: () => { done = true; m.close(); resolve(i); },
    }, ...String(it).split("\n").map((line, j) => (j ? h("small", line) : h("span", line)))))),
  });
});

/** Saisie de texte ; renvoie la valeur ou null. */
export const prompt = (title, message, value = "", maxLength = 100) => new Promise((resolve) => {
  const input = h("input.input", { value, maxLength });
  let done = false;
  modal({
    title, body: [message && h("p", message), input].filter(Boolean),
    onClose: () => { if (!done) resolve(null); },
    buttons: [{ label: "Annuler" }, { label: "Enregistrer", primary: true, onClick: () => { done = true; resolve(input.value); } }],
  });
  setTimeout(() => input.focus(), 50);
});

/** Choisit une image (galerie / appareil photo selon `capture`). */
/** Choisit une photo (ou plusieurs avec multiple : renvoie alors un tableau, vide si rien n'est choisi). */
export function pickImage({ capture = false, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: "image/*", style: { display: "none" } });
    if (capture) input.setAttribute("capture", "environment");
    if (multiple) input.multiple = true;
    const result = () => (multiple ? [...(input.files || [])] : input.files?.[0] || null);
    input.addEventListener("change", () => { resolve(result()); input.remove(); });
    window.addEventListener("focus", () => setTimeout(() => { if (!input.files?.length) resolve(result()); }, 1500), { once: true });
    document.body.append(input);
    input.click();
  });
}

/** Réduit une image en JPEG (côté max), orientation EXIF respectée. */
export async function toJpeg(file, maxSide = 2048, quality = 0.85) {
  const { img, done } = await decodeImage(file, maxSide);
  try {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const f = Math.min(1, maxSide / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * f)), hgt = Math.max(1, Math.round(ih * f));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = hgt;
    const g = canvas.getContext("2d");
    g.imageSmoothingQuality = "high"; // réduction nette, sans crénelage
    g.drawImage(img, 0, 0, w, hgt);
    const out = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!out) throw new Error("conversion en JPEG impossible");
    return out;
  } finally { done(); }
}

/** Format d'image lu dans les premiers octets (le nom ou le type annoncé par le téléphone peuvent manquer). */
export async function imageKind(file) {
  try {
    const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const s = String.fromCharCode(...b);
    if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
    if (s.startsWith("\x89PNG")) return "png";
    if (s.startsWith("RIFF") && s.slice(8, 12) === "WEBP") return "webp";
    if (s.slice(4, 8) === "ftyp") {
      const brand = s.slice(8, 12);
      if (/^(avif|avis)$/.test(brand)) return "avif";
      if (/^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand)) return "heic";
    }
    return b.length ? "inconnu" : "vide";
  } catch { return "illisible"; }
}

/**
 * Décode une photo, avec plusieurs essais : certains téléphones (WebView Android, vieux Safari) refusent l'une ou
 * l'autre méthode, et une très grande photo peut manquer de mémoire (on la décode alors directement réduite).
 * Renvoie { img, done } (done libère la mémoire) ou lève une erreur qui résume les essais.
 */
export async function decodeImage(file, maxSide = 2048) {
  const errors = [];
  const tries = [
    async () => { const b = await createImageBitmap(file, { imageOrientation: "from-image" }); return { img: b, done: () => b.close?.() }; },
    async () => {
      const url = URL.createObjectURL(file), im = new Image();
      im.decoding = "async";
      try {
        await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error("image non décodée")); im.src = url; });
        if (!im.naturalWidth) throw new Error("image vide");
      } catch (e) { URL.revokeObjectURL(url); throw e; }
      return { img: im, done: () => URL.revokeObjectURL(url) };
    },
    async () => { const b = await createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: maxSide, resizeQuality: "high" }); return { img: b, done: () => b.close?.() }; },
    async () => { const b = await createImageBitmap(file); return { img: b, done: () => b.close?.() }; },
  ];
  for (const t of tries) {
    try { return await t(); } catch (e) { errors.push(e?.message || String(e)); }
  }
  const err = new Error(errors[0] || "photo illisible");
  err.details = errors;
  throw err;
}

/**
 * Photo prête à être envoyée sur le serveur : JPEG de 1600 px au plus, qualité 0,82 (net, même en plein écran
 * sur un téléphone), environ 2 fois plus léger que l'original réduit. Une photo très détaillée qui dépasse
 * `maxBytes` est encore allégée, sans descendre sous la qualité 0,7 ni sous 1280 px : elle reste jolie.
 */
export async function compressForUpload(blob, { maxSide = 1600, quality = 0.82, maxBytes = 350 * 1024, minQuality = 0.7, minSide = 1280 } = {}) {
  let side = maxSide, q = quality;
  let out = await toJpeg(blob, side, q);
  while (out && out.size > maxBytes && (q > minQuality || side > minSide)) {
    if (q > minQuality) q = Math.max(minQuality, Math.round((q - 0.04) * 100) / 100);
    else side = Math.max(minSide, Math.round(side * 0.9));
    out = await toJpeg(blob, side, q);
  }
  // Jamais l'original : refaire l'image efface aussi ses informations cachées (EXIF), dont la position GPS
  if (!out) throw new Error("Impossible de préparer la photo pour l'envoi");
  return out;
}

/**
 * Informations EXIF d'un JPEG : date de prise de vue (ms, heure locale) et position GPS.
 * { date: number|null, lat: number|null, lon: number|null }
 */
export async function exifInfo(file) {
  const out = { date: null, lat: null, lon: null };
  try {
    const buf = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf.getUint16(0) !== 0xffd8) return out;
    let off = 2;
    while (off + 4 < buf.byteLength) {
      const marker = buf.getUint16(off), len = buf.getUint16(off + 2);
      if (marker === 0xffe1 && buf.getUint32(off + 4) === 0x45786966) {
        const t = off + 10, le = buf.getUint16(t) === 0x4949;
        const u16 = (o) => buf.getUint16(t + o, le), u32 = (o) => buf.getUint32(t + o, le);
        const readIfd = (o) => {
          const n = u16(o), tags = {};
          for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; tags[u16(e)] = e; }
          return tags;
        };
        const ifd0 = readIfd(u32(4));
        const ascii = (e) => {
          const cnt = u32(e + 4), p = cnt > 4 ? u32(e + 8) : e + 8;
          let str = ""; for (let i = 0; i < cnt - 1; i++) str += String.fromCharCode(buf.getUint8(t + p + i));
          return str;
        };
        const rationals = (e) => {
          const p = u32(e + 8), r = [];
          for (let i = 0; i < u32(e + 4); i++) { const d = u32(p + i * 8 + 4); r.push(d ? u32(p + i * 8) / d : 0); }
          return r;
        };
        let raw = null;
        if (ifd0[0x8769]) { const ex = readIfd(u32(ifd0[0x8769] + 8)); if (ex[0x9003]) raw = ascii(ex[0x9003]); }
        if (!raw && ifd0[0x0132]) raw = ascii(ifd0[0x0132]);
        const m = raw && raw.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
        if (m) out.date = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
        if (ifd0[0x8825]) {
          const g = readIfd(u32(ifd0[0x8825] + 8));
          if (g[2] && g[4]) {
            const dms = (a) => a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600;
            const lat = dms(rationals(g[2])) * (g[1] && ascii(g[1]) === "S" ? -1 : 1);
            const lon = dms(rationals(g[4])) * (g[3] && ascii(g[3]) === "W" ? -1 : 1);
            if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) { out.lat = lat; out.lon = lon; }
          }
        }
        return out;
      }
      off += 2 + len;
    }
  } catch { /* pas d'EXIF lisible */ }
  return out;
}

/** Date de prise de vue EXIF d'un JPEG, en ms, ou null. */
export async function exifDate(file) { return (await exifInfo(file)).date; }

/** Stockage local tolérant aux erreurs (navigation privée…). */
/** Décalage (ms) de l'heure de Paris par rapport à UTC à l'instant t (heure d'été comprise). */
// Un seul formateur (en créer un à chaque appel coûtait ~0,15 ms : 200 ms et plus par recherche radar avec 1 300 passages)
let parisFmt = null;
function parisOffset(t) {
  parisFmt ||= new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric",
    month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
  const p = Object.fromEntries(parisFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

/**
 * Début de la semaine du concours photo : lundi 0 h, heure de Paris (comme `private.week_of` côté serveur).
 * Les passages d'avions (Collection › Au-dessus) repartent à zéro à ce moment-là.
 */
let weekCache = { at: 0, value: 0 };
export function weekStart(now) {
  // Appelée pour chaque passage d'avion (des milliers de fois) : résultat gardé une minute
  if (now == null) {
    const t = Date.now();
    if (t - weekCache.at < 60e3) return weekCache.value;
    weekCache = { at: t, value: weekStartAt(t) };
    return weekCache.value;
  }
  return weekStartAt(now);
}
function weekStartAt(now) {
  try {
    const wall = new Date(now + parisOffset(now));                  // date et heure de Paris
    const monday = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() - ((wall.getUTCDay() + 6) % 7));
    return monday - parisOffset(monday - parisOffset(now));          // lundi 0 h à Paris, en heure universelle
  } catch {                                                          // navigateur sans fuseaux horaires : heure du téléphone
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime();
  }
}

export const ls = {
  get(k, def = null) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* plein ou bloqué */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* bloqué */ } },
};

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

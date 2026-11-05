// Vérifications automatiques d'une photo avant d'accorder des XP :
//  1. Date : la photo a été prise pendant le passage de l'avion (date EXIF de l'appareil photo).
//  2. Lieu : si la photo contient une position GPS, elle a été prise près de l'endroit du passage.
//  3. Photo originale : pas une photo déjà utilisée, ni une copie de la photo de l'appareil ou de Wikipédia.
//  4. Ciel : une bonne partie de l'image est du ciel, reconnu par une IA ultra-légère (U-Net, skynet.js) qui tourne
//     sur le téléphone ; sinon (IA indisponible) par l'analyse des couleurs et des zones lisses.
// Tout se passe sur l'appareil, sans envoyer la photo nulle part.
import { exifInfo, distanceKm } from "./util.js";
import { AdsbDb, Wiki } from "./net.js";
import { prettyModel } from "./game.js";
import { SKY_SIZE, loadSkyModel, skyShareOf } from "./skynet.js";

export const PHOTO_MAX_KM = 60;   // l'avion à moins de 30 km + déplacement du photographe
const BEFORE_MS = 75 * 60e3;      // tolérance d'horloge (appareil photo mal réglé, heure d'été)
const AFTER_MS = 4 * 3600e3;      // l'avion a pu rester visible un moment après sa première détection
const CAMERA_MS = 30 * 60e3;      // photo « prise maintenant » : au plus 30 min d'écart
const SAME_PHOTO = 12;            // empreintes quasi identiques (sur 64 points) : même image
const SAME_SHOT = 20;             // même seconde de prise de vue + empreinte proche : même photo
const COPY_PHOTO = 12;            // ressemblance avec une photo d'internet
const MIN_STRENGTH = 20;          // en dessous, l'image est trop uniforme (ciel pur) pour être comparée
export const SKY_MIN = 0.25;      // part minimale de « ciel » dans l'image (analyse des couleurs, si l'IA est indisponible)
export const SKY_MIN_AI = 0.15;   // part minimale de ciel reconnue par l'IA (photos sans ciel : moins de 4 %)
const NIGHT_LUMA = 50;            // image très sombre : l'IA connaît mal le ciel de nuit, on se fie aussi aux couleurs

/**
 * Vérifie une photo pour l'avion `s` (spotted).
 * camera : photo prise à l'instant dans l'appli ; seenAt : heure du passage ;
 * own : empreintes des photos déjà dans la collection [{ phash, pstrength, shotAt, fileHash }].
 * Renvoie { ok, checks: [{ label, ok, detail }], print: { phash, pstrength, shotAt, fileHash }, reason }.
 */
export async function verifyPhoto(file, blob, s, { camera = false, seenAt = Date.now(), own = [] } = {}) {
  const checks = [];
  const exif = await exifInfo(file);
  const fmt = (t) => new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const inWindow = (t) => t >= seenAt - BEFORE_MS && t <= seenAt + AFTER_MS;

  // 1. Date
  if (camera) {
    const shot = exif.date ?? Date.now();
    if (Math.abs(shot - Date.now()) > CAMERA_MS) checks.push({ label: "Date", ok: false, detail: "cette photo n'a pas été prise à l'instant" });
    else if (!inWindow(shot)) checks.push({ label: "Date", ok: false, detail: `l'avion est passé le ${fmt(seenAt)}, pas maintenant` });
    else checks.push({ label: "Date", ok: true, detail: "photo prise à l'instant" });
  } else if (!exif.date) {
    checks.push({ label: "Date", ok: false, detail: "date de prise de vue introuvable (capture d'écran, image d'internet ou photo envoyée par messagerie ?)" });
  } else {
    const ok = inWindow(exif.date);
    checks.push({ label: "Date", ok, detail: ok ? "prise pendant le passage de l'avion" : `prise le ${fmt(exif.date)}, l'avion est passé le ${fmt(seenAt)}` });
  }

  // 2. Lieu (seulement si la photo contient une position et que l'on connaît celle du passage)
  if (exif.lat != null && s.obsLat != null) {
    const d = distanceKm(exif.lat, exif.lon, s.obsLat, s.obsLon);
    const ok = d <= PHOTO_MAX_KM;
    checks.push({ label: "Lieu", ok, detail: ok ? "prise près de l'endroit du passage" : `prise à ${Math.round(d)} km de l'endroit du passage` });
  } else {
    checks.push({ label: "Lieu", ok: true, detail: "pas de position dans la photo (non vérifiable)" });
  }

  // 3. Photo originale
  let fp = null;
  try { fp = await fingerprint(blob); } catch { /* image illisible */ }
  const print = { phash: fp?.hash || null, pstrength: fp?.strength ?? null, shotAt: exif.date, fileHash: await fileHash(file) };
  if (!fp) {
    checks.push({ label: "Photo originale", ok: true, detail: "non vérifiable" });
  } else if (own.some((o) => samePhoto(print, o))) {
    checks.push({ label: "Photo originale", ok: false, detail: "cette photo est déjà dans votre collection" });
  } else {
    const copy = fp.strength >= MIN_STRENGTH ? await timeout(looksLikeReference(fp.hash, s), 15000, null) : null;
    checks.push({ label: "Photo originale", ok: !copy, detail: copy ? `copie d'une photo d'internet (${copy})` : "photo personnelle" });
  }

  // 4. Ciel visible : IA sur le téléphone ; analyse des couleurs si elle ne peut pas tourner, ou pour un ciel de nuit
  checks.push(await skyCheck(blob));

  const failed = checks.filter((c) => !c.ok);
  return { ok: !failed.length, checks, print, reason: failed.map((c) => c.label).join(", ") };
}

/** Lignes « ✅ Date : … » pour la fenêtre de résultat. */
export const checksText = (v) => v.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.label} : ${c.detail}`).join("\n");

/**
 * Même photo ? Même fichier ; ou même seconde de prise de vue et image proche ; ou, pour une image
 * assez détaillée, empreinte quasi identique. Deux photos d'un ciel uniforme se ressemblent trop
 * pour être comparées sur l'image seule.
 */
function samePhoto(a, b) {
  if (!b) return false;
  if (a.fileHash && a.fileHash === b.fileHash) return true;
  if (!a.phash || !b.phash) return false;
  const d = hamming(a.phash, b.phash);
  if (a.shotAt && b.shotAt && Math.abs(a.shotAt - b.shotAt) < 1000 && d <= SAME_SHOT) return true;
  return d <= SAME_PHOTO && a.pstrength >= MIN_STRENGTH && (b.pstrength ?? 0) >= MIN_STRENGTH;
}

/** Empreinte exacte du fichier (SHA-256, 16 premiers caractères). */
async function fileHash(file) {
  try {
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
    return [...d.slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

const timeout = (p, ms, fallback) => Promise.race([p, new Promise((res) => setTimeout(() => res(fallback), ms))]);

// ---------- Empreinte visuelle (dHash 64 points) ----------

async function bitmapOf(src) {
  if (src instanceof Blob) return createImageBitmap(src);
  // Image en ligne : chargée en mode CORS pour pouvoir lire ses pixels
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.referrerPolicy = "no-referrer";
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; setTimeout(rej, 12000); });
  return img;
}

function pixels(source, w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingQuality = "high";
  g.drawImage(source, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

// Grille 9 × 8 et projection qui retire les dégradés doux (vignettage, ciel plus clair vers l'horizon) :
// sans elle, toutes les photos de ciel d'un même téléphone auraient la même empreinte.
const GW = 9, GH = 8, CELL = 8;
const DETREND = (() => {
  const A = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const u = x / (GW - 1) - 0.5, v = y / (GH - 1) - 0.5;
    A.push([1, u, v, u * u, u * v, v * v]);
  }
  // M = (AᵀA)⁻¹ Aᵀ, par élimination de Gauss
  const n = 6, N = A.map((r) => r.slice());
  const ata = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)));
  const inv = ata.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(inv[r][c]) > Math.abs(inv[p][c])) p = r;
    [inv[c], inv[p]] = [inv[p], inv[c]];
    const f = inv[c][c]; for (let j = 0; j < 2 * n; j++) inv[c][j] /= f;
    for (let r = 0; r < n; r++) if (r !== c) { const g = inv[r][c]; for (let j = 0; j < 2 * n; j++) inv[r][j] -= g * inv[c][j]; }
  }
  const I = inv.map((r) => r.slice(n));
  const M = I.map((row) => A.map((a) => row.reduce((s, v, j) => s + v * a[j], 0)));
  return { A: N, M };
})();

/**
 * Empreinte de 64 points (16 caractères hexadécimaux), stable si l'image est redimensionnée ou recompressée,
 * et sa « force » : nombre de points vraiment contrastés (un ciel uniforme a une empreinte peu fiable).
 */
export async function fingerprint(src) {
  const W = GW * CELL, H = GH * CELL, d = pixels(await bitmapOf(src), W, H);
  // Moyenne de chaque case de 8 × 8 pixels
  const g = new Float64Array(GW * GH);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    g[((y / CELL) | 0) * GW + ((x / CELL) | 0)] += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / (CELL * CELL);
  }
  // Retire le dégradé d'ensemble (surface du second degré ajustée aux moindres carrés)
  const coef = DETREND.M.map((row) => row.reduce((s, m, k) => s + m * g[k], 0));
  const r = g.map((v, k) => v - DETREND.A[k].reduce((s, a, j) => s + a * coef[j], 0));
  let bits = "", strength = 0;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW - 1; x++) {
      const a = r[y * GW + x], b = r[y * GW + x + 1];
      bits += a > b ? "1" : "0";
      if (Math.abs(a - b) > 2) strength++;
    }
  }
  let hash = "";
  for (let k = 0; k < 64; k += 4) hash += parseInt(bits.slice(k, k + 4), 2).toString(16);
  return { hash, strength };
}

export function hamming(a, b) {
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { n += x & 1; x >>= 1; }
  }
  return n;
}

/** Compare avec la photo de l'appareil (adsbdb) et celles du modèle (Wikipédia). Renvoie la source copiée ou null. */
async function looksLikeReference(hash, s) {
  const refs = [];
  try { const info = await AdsbDb.aircraft(s.hex); if (info?.photoUrl) refs.push(["photo de l'appareil", info.photoUrl]); } catch { /* hors ligne */ }
  try {
    const w = await Wiki.find({ type: s.type, model: s.model, military: s.military, title: prettyModel(s.model || s.type) });
    for (const u of new Set([w?.thumbnailUrl, w?.imageUrl].filter(Boolean))) refs.push(["Wikipédia", u]);
  } catch { /* hors ligne */ }
  for (const [name, url] of refs) {
    try {
      const r = await fingerprint(url);
      if (r.strength >= MIN_STRENGTH && hamming(hash, r.hash) <= COPY_PHOTO) return name;
    } catch { /* image non comparable (pas d'accès CORS) */ }
  }
  return null;
}

// ---------- Ciel visible ----------

/** Contrôle « Ciel visible » : IA d'abord, analyse des couleurs en secours. */
export async function skyCheck(blob) {
  const pct = (v) => `${Math.round(v * 100)} %`;
  let ai = null, colors = null;
  try { ai = await timeout(skyShareAI(blob), 30000, null); } catch { /* IA indisponible : analyse des couleurs */ }
  if (ai != null && ai >= SKY_MIN_AI) return { label: "Ciel visible", ok: true, detail: `ciel sur ${pct(ai)} de l'image (reconnu par l'IA)` };
  try { colors = await skyStats(blob); } catch { /* image illisible */ }
  if (ai == null) {
    if (!colors) return { label: "Ciel visible", ok: true, detail: "non vérifiable" };
    const ok = colors.share >= SKY_MIN;
    return { label: "Ciel visible", ok, detail: ok ? `ciel sur ${pct(colors.share)} de l'image` : `presque pas de ciel (${pct(colors.share)} de l'image)` };
  }
  // L'IA voit peu de ciel : seule exception, la nuit (image très sombre et lisse)
  if (colors && colors.luma < NIGHT_LUMA && colors.share >= SKY_MIN) return { label: "Ciel visible", ok: true, detail: "ciel de nuit" };
  return { label: "Ciel visible", ok: false, detail: `presque pas de ciel (${pct(ai)} de l'image, d'après l'IA)` };
}

// IA « ciel » (U-Net ultra-léger, skynet.js) : dans un travailleur en arrière-plan pour ne pas figer l'écran,
// ou directement sur la page si le navigateur ne le permet pas.
let worker = null, jobs = 0;
export async function skyShareAI(blob) {
  const rgba = pixels(await bitmapOf(blob), SKY_SIZE, SKY_SIZE);
  if (typeof Worker !== "undefined" && worker !== false) {
    try {
      worker ||= new Worker(new URL("./skyworker.js", import.meta.url), { type: "module" });
      return await new Promise((resolve, reject) => {
        const id = ++jobs;
        const done = (e) => {
          if (e.data?.id !== id) return;
          worker.removeEventListener("message", done);
          if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.share);
        };
        worker.addEventListener("message", done);
        worker.onerror = (ev) => { ev.preventDefault?.(); reject(new Error(ev.message || "travailleur indisponible")); };
        worker.postMessage({ id, rgba: rgba.slice(), enough: SKY_MIN_AI });
      });
    } catch { worker?.terminate?.(); worker = false; /* on réessaie sur la page */ }
  }
  return skyShareOf(await loadSkyModel(), rgba, SKY_MIN_AI);
}

/**
 * Part de l'image (0 à 1) qui ressemble à du ciel : zones très lisses (pas de texture, contrairement
 * à un visage, un objet, de l'herbe ou un mur de briques) dont la couleur est celle d'un ciel bleu
 * (même sombre au crépuscule), gris ou blanc (nuages, brume), d'un coucher de soleil ou de la nuit.
 * Réglée sur des photos réelles : un ciel dépasse 45 %, une photo d'intérieur ou d'animal reste sous 20 %.
 */
export async function skyShare(blob) { return (await skyStats(blob)).share; }

/** Part de ciel d'après les couleurs (share) et luminosité moyenne de l'image (luma, 0 à 255). */
export async function skyStats(blob) {
  const N = 64, d = pixels(await bitmapOf(blob), N, N);
  const L = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) L[k] = d[k * 4] * 0.299 + d[k * 4 + 1] * 0.587 + d[k * 4 + 2] * 0.114;
  let sky = 0, luma = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = y * N + x, r = d[k * 4], g = d[k * 4 + 1], b = d[k * 4 + 2], l = L[k];
      luma += l;
      // Zone lisse : aucun voisin (8 autour) ne s'écarte de plus de 8 niveaux de luminosité
      let rough = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(N - 1, Math.max(0, x + dx)), yy = Math.min(N - 1, Math.max(0, y + dy));
        rough = Math.max(rough, Math.abs(l - L[yy * N + xx]));
      }
      const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0;
      // Les nuages ont des bords doux : plus de relief toléré pour une zone claire et grise
      const cloudy = sat < 0.25 && l > 110;
      if (rough >= (cloudy ? 18 : 8)) continue;
      const blue = b > r + 8 && b >= g - 5 && l > 25;               // ciel bleu, du plus pâle au crépuscule
      const grey = sat < 0.18 && l > 70;                            // nuages, ciel couvert, brume
      const dusk = r > b && l > 100 && sat > 0.12 && sat < 0.6;     // aube, coucher de soleil
      const night = l < 40;                                         // ciel de nuit
      if (blue || grey || dusk || night) sky++;
    }
  }
  return { share: sky / (N * N), luma: luma / (N * N) };
}

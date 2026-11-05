// IA « ciel » ultra-légère : U-Net EGE-UNet (≈ 76 000 paramètres, 300 Ko) qui dit, pixel par pixel, ce qui est du ciel
// (bleu, nuageux, couvert, couchant). Tourne entièrement sur le téléphone : la photo n'est envoyée nulle part.
// Modèle : xiongzhu666/Sky-Segmentation-and-Post-processing (licence MIT, voir models/LICENSE-sky.txt), converti
// depuis ncnn en un graphe JSON (models/sky-ege.json) + poids float32 (models/sky-ege.bin), exécuté ici couche par couche.
// Aucune dépendance au navigateur dans ce fichier (utilisable dans un Worker ou dans Node pour les essais).

export const SKY_SIZE = 384; // le modèle travaille sur une image de 384 × 384

let loading = null;
/** Charge le modèle une seule fois (base : dossier des fichiers du modèle). */
export function loadSkyModel(base = new URL("../models/", import.meta.url).href) {
  if (!loading) {
    loading = Promise.all([
      fetch(base + "sky-ege.json").then((r) => { if (!r.ok) throw new Error("modèle introuvable"); return r.json(); }),
      fetch(base + "sky-ege.bin").then((r) => { if (!r.ok) throw new Error("poids introuvables"); return r.arrayBuffer(); }),
    ]).then(([graph, buf]) => ({ graph, W: new Float32Array(buf) }))
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
}

/**
 * Image RGBA (Uint8ClampedArray de SKY_SIZE × SKY_SIZE) → entrée du modèle (3 plans R, G, B),
 * valeurs étalées de 0 à 255 entre le pixel le plus sombre et le plus clair (comme à l'entraînement).
 * balance : corrige d'abord une dominante de couleur (« monde gris » : les 3 couleurs ramenées à la même moyenne).
 * Sans elle, un ciel couvert verdâtre ou jaunâtre (balance des blancs du téléphone) n'est pas reconnu.
 */
export function prepare(rgba, { balance = true, S = SKY_SIZE } = {}) {
  const n = S * S, x = new Float32Array(3 * n), mean = [0, 0, 0];
  for (let k = 0; k < n; k++) for (let ch = 0; ch < 3; ch++) mean[ch] += rgba[k * 4 + ch];
  const avg = (mean[0] + mean[1] + mean[2]) / 3;
  const gain = mean.map((m) => (balance ? avg / Math.max(m, 1) : 1));
  let mn = 255, mx = 0;
  for (let k = 0; k < n; k++) {
    for (let ch = 0; ch < 3; ch++) {
      const v = Math.min(255, rgba[k * 4 + ch] * gain[ch]);
      x[ch * n + k] = v;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  const f = 255 / Math.max(mx - mn, 1e-6);
  for (let k = 0; k < 3 * n; k++) x[k] = (x[k] - mn) * f;
  return x;
}

/**
 * Part de ciel (0 à 1) d'une image RGBA de SKY_SIZE × SKY_SIZE : couleurs corrigées d'abord ; si le ciel
 * semble absent (moins de `enough`), second essai sur les couleurs d'origine, et on garde le meilleur.
 */
export function skyShareOf(model, rgba, enough = 0.15) {
  const a = skyFraction(runSky(model, prepare(rgba, { balance: true })));
  if (a >= enough) return a;
  return Math.max(a, skyFraction(runSky(model, prepare(rgba, { balance: false }))));
}

/** Part de ciel (0 à 1) d'une carte de probabilités. */
export function skyFraction(prob, threshold = 0.5) {
  let s = 0;
  for (let k = 0; k < prob.length; k++) if (prob[k] > threshold) s++;
  return s / prob.length;
}

// ---------- Les opérations du réseau (mêmes règles que ncnn, la bibliothèque d'origine) ----------
// Un tenseur = { c, h, w, d } : c plans de h lignes × w colonnes, rangés à la suite dans d (Float32Array).
const T = (c, h, w, d = new Float32Array(c * h * w)) => ({ c, h, w, d });

/**
 * Cas le plus courant, optimisé : noyau 3 × 3, pas de 1, marge = dilatation (« same »). L'entrée est bordée de zéros
 * une fois, puis chaque ligne de sortie reçoit les 9 contributions en un seul passage (≈ 3 fois plus rapide).
 */
function conv3x3(x, L, W) {
  const { oc, g } = L, dl = L.dw, { c, h, w, d } = x;
  const pw = w + 2 * dl, ph = h + 2 * dl, P = new Float32Array(c * ph * pw);
  for (let ch = 0; ch < c; ch++) for (let y = 0; y < h; y++) P.set(d.subarray((ch * h + y) * w, (ch * h + y + 1) * w), (ch * ph + y + dl) * pw + dl);
  const out = new Float32Array(oc * h * w), plane = h * w, icg = c / g, ocg = oc / g, wo = L.W[0];
  if (L.B) for (let o = 0; o < oc; o++) out.fill(W[L.B[0] + o], o * plane, (o + 1) * plane);
  const d2 = 2 * dl, rs = dl * pw;
  for (let o = 0; o < oc; o++) {
    const g0 = Math.floor(o / ocg) * icg, ob = o * plane;
    for (let i = 0; i < icg; i++) {
      const k = wo + (o * icg + i) * 9;
      const w0 = W[k], w1 = W[k + 1], w2 = W[k + 2], w3 = W[k + 3], w4 = W[k + 4], w5 = W[k + 5], w6 = W[k + 6], w7 = W[k + 7], w8 = W[k + 8];
      const pb = (g0 + i) * ph * pw;
      for (let oy = 0; oy < h; oy++) {
        const r0 = pb + oy * pw, r1 = r0 + rs, r2 = r1 + rs, ro = ob + oy * w;
        for (let ox = 0; ox < w; ox++) {
          out[ro + ox] += w0 * P[r0 + ox] + w1 * P[r0 + ox + dl] + w2 * P[r0 + ox + d2]
            + w3 * P[r1 + ox] + w4 * P[r1 + ox + dl] + w5 * P[r1 + ox + d2]
            + w6 * P[r2 + ox] + w7 * P[r2 + ox + dl] + w8 * P[r2 + ox + d2];
        }
      }
    }
  }
  return T(oc, h, w, out);
}

function conv(x, L, W) {
  const { oc, kw, kh, dw: dlw, dh: dlh, sw, sh, pl, pt, pr, pb, g } = L;
  if (kw === 3 && kh === 3 && sw === 1 && sh === 1 && dlw === dlh && pl === dlw && pt === dlw && pr === dlw && pb === dlw) return conv3x3(x, L, W);
  const { c, h, w, d } = x;
  const oh = Math.floor((h + pt + pb - dlh * (kh - 1) - 1) / sh) + 1;
  const ow = Math.floor((w + pl + pr - dlw * (kw - 1) - 1) / sw) + 1;
  const out = new Float32Array(oc * oh * ow), plane = oh * ow;
  const icg = c / g, ocg = oc / g, wo = L.W[0];
  if (L.B) for (let o = 0; o < oc; o++) out.fill(W[L.B[0] + o], o * plane, (o + 1) * plane);
  for (let o = 0; o < oc; o++) {
    const g0 = Math.floor(o / ocg) * icg, ob = o * plane;
    for (let i = 0; i < icg; i++) {
      const ib = (g0 + i) * h * w;
      for (let ky = 0; ky < kh; ky++) {
        const offy = ky * dlh - pt;
        const oy0 = Math.max(0, Math.ceil(-offy / sh)), oy1 = Math.min(oh, Math.floor((h - 1 - offy) / sh) + 1);
        for (let kx = 0; kx < kw; kx++) {
          const wv = W[wo + ((o * icg + i) * kh + ky) * kw + kx];
          if (wv === 0) continue;
          const offx = kx * dlw - pl;
          const ox0 = Math.max(0, Math.ceil(-offx / sw)), ox1 = Math.min(ow, Math.floor((w - 1 - offx) / sw) + 1);
          for (let oy = oy0; oy < oy1; oy++) {
            const ro = ob + oy * ow, ri = ib + (oy * sh + offy) * w + offx;
            if (sw === 1) for (let ox = ox0; ox < ox1; ox++) out[ro + ox] += wv * d[ri + ox];
            else for (let ox = ox0; ox < ox1; ox++) out[ro + ox] += wv * d[ri + ox * sw];
          }
        }
      }
    }
  }
  return T(oc, oh, ow, out);
}

function groupNorm(x, L, W) {
  const { c, h, w, d } = x, out = new Float32Array(d.length), cg = c / L.groups, n = cg * h * w;
  for (let gi = 0; gi < L.groups; gi++) {
    const s0 = gi * n;
    let m = 0; for (let k = 0; k < n; k++) m += d[s0 + k]; m /= n;
    let v = 0; for (let k = 0; k < n; k++) { const t = d[s0 + k] - m; v += t * t; } v /= n;
    const inv = 1 / Math.sqrt(v + L.eps);
    for (let ci = 0; ci < cg; ci++) {
      const ch = gi * cg + ci, ga = W[L.G[0] + ch], be = W[L.Be[0] + ch], b0 = ch * h * w;
      for (let k = 0; k < h * w; k++) out[b0 + k] = (d[b0 + k] - m) * inv * ga + be;
    }
  }
  return T(c, h, w, out);
}

function layerNorm(x, L, W) {
  const { c, h, w, d } = x, out = new Float32Array(d.length);
  const n = L.size === w ? w : h * w; // sur chaque ligne, ou sur tout le plan
  const G = L.G[0], Be = L.Be[0];
  for (let s0 = 0; s0 < d.length; s0 += n) {
    let m = 0; for (let k = 0; k < n; k++) m += d[s0 + k]; m /= n;
    let v = 0; for (let k = 0; k < n; k++) { const t = d[s0 + k] - m; v += t * t; } v /= n;
    const inv = 1 / Math.sqrt(v + L.eps);
    for (let k = 0; k < n; k++) out[s0 + k] = (d[s0 + k] - m) * inv * W[G + k] + W[Be + k];
  }
  return T(c, h, w, out);
}

function maxpool(x) { // 2 × 2, pas de 2
  const { c, h, w, d } = x, oh = h >> 1, ow = w >> 1, out = new Float32Array(c * oh * ow);
  let k = 0;
  for (let ch = 0; ch < c; ch++) {
    for (let y = 0; y < oh; y++) {
      const r0 = (ch * h + 2 * y) * w, r1 = r0 + w;
      for (let xx = 0; xx < ow; xx++) {
        const a = d[r0 + 2 * xx], b = d[r0 + 2 * xx + 1], e = d[r1 + 2 * xx], f = d[r1 + 2 * xx + 1];
        out[k++] = Math.max(a, b, e, f);
      }
    }
  }
  return T(c, oh, ow, out);
}

// erf avec une erreur < 1,2e-7 (Numerical Recipes)
function erf(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806
    + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - r : r - 1;
}
function map(x, f) { const out = new Float32Array(x.d.length); for (let k = 0; k < out.length; k++) out[k] = f(x.d[k]); return T(x.c, x.h, x.w, out); }
const gelu = (x) => map(x, (v) => 0.5 * v * (1 + erf(v * Math.SQRT1_2)));
const sigmoid = (x) => map(x, (v) => 1 / (1 + Math.exp(-v)));

// Permutation des axes (c, h, w), mêmes numéros d'ordre que ncnn
const PERM = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
function permute(x, order) {
  const p = PERM[order], dims = [x.c, x.h, x.w], st = [x.h * x.w, x.w, 1];
  const [n0, n1, n2] = [dims[p[0]], dims[p[1]], dims[p[2]]], [s0, s1, s2] = [st[p[0]], st[p[1]], st[p[2]]];
  const out = new Float32Array(x.d.length), d = x.d;
  let k = 0;
  for (let a = 0; a < n0; a++) for (let b = 0; b < n1; b++) {
    const base = a * s0 + b * s1;
    for (let e = 0; e < n2; e++) out[k++] = d[base + e * s2];
  }
  return T(n0, n1, n2, out);
}

function slice(x, parts) { // en parts égales sur les plans
  const cc = x.c / parts, n = cc * x.h * x.w;
  return Array.from({ length: parts }, (_, i) => T(cc, x.h, x.w, x.d.subarray(i * n, (i + 1) * n)));
}

function concat(xs) {
  const c = xs.reduce((s, t) => s + t.c, 0), out = new Float32Array(c * xs[0].h * xs[0].w);
  let off = 0; for (const t of xs) { out.set(t.d, off); off += t.d.length; }
  return T(c, xs[0].h, xs[0].w, out);
}

function binary(a, b, op) { // addition ou multiplication, avec diffusion des dimensions égales à 1
  const c = Math.max(a.c, b.c), h = Math.max(a.h, b.h), w = Math.max(a.w, b.w);
  const out = new Float32Array(c * h * w);
  const sa = [a.c > 1 ? a.h * a.w : 0, a.h > 1 ? a.w : 0, a.w > 1 ? 1 : 0];
  const sb = [b.c > 1 ? b.h * b.w : 0, b.h > 1 ? b.w : 0, b.w > 1 ? 1 : 0];
  let k = 0;
  for (let z = 0; z < c; z++) for (let y = 0; y < h; y++) {
    let ia = z * sa[0] + y * sa[1], ib = z * sb[0] + y * sb[1];
    if (op === 0) for (let x = 0; x < w; x++, ia += sa[2], ib += sb[2]) out[k++] = a.d[ia] + b.d[ib];
    else for (let x = 0; x < w; x++, ia += sa[2], ib += sb[2]) out[k++] = a.d[ia] * b.d[ib];
  }
  return T(c, h, w, out);
}

function interp(x, L) { // bilinéaire, coins alignés
  const { c, h, w, d } = x;
  const oh = L.oh || Math.floor(h * L.sh), ow = L.ow || Math.floor(w * L.sw);
  const fy = oh > 1 ? (h - 1) / (oh - 1) : 0, fx = ow > 1 ? (w - 1) / (ow - 1) : 0;
  const x0 = new Int32Array(ow), x1 = new Int32Array(ow), ax = new Float32Array(ow);
  for (let i = 0; i < ow; i++) { const s = i * fx; x0[i] = Math.floor(s); x1[i] = Math.min(x0[i] + 1, w - 1); ax[i] = s - x0[i]; }
  const out = new Float32Array(c * oh * ow);
  let k = 0;
  for (let ch = 0; ch < c; ch++) for (let j = 0; j < oh; j++) {
    const s = j * fy, y0 = Math.floor(s), y1 = Math.min(y0 + 1, h - 1), ay = s - y0;
    const r0 = (ch * h + y0) * w, r1 = (ch * h + y1) * w;
    for (let i = 0; i < ow; i++) {
      const top = d[r0 + x0[i]] * (1 - ax[i]) + d[r0 + x1[i]] * ax[i];
      const bot = d[r1 + x0[i]] * (1 - ax[i]) + d[r1 + x1[i]] * ax[i];
      out[k++] = top * (1 - ay) + bot * ay;
    }
  }
  return T(c, oh, ow, out);
}

/** Exécute le réseau. input : Float32Array (3 × S × S, sortie de prepare). Renvoie les probabilités de ciel (S × S). */
export function runSky({ graph, W }, input) {
  const S = graph.size, B = new Array(graph.blobs);
  // Nombre d'utilisations de chaque résultat intermédiaire : libéré dès qu'il ne sert plus (mémoire du téléphone)
  const uses = new Int32Array(graph.blobs);
  for (const L of graph.layers) for (const i of L.i) uses[i]++;
  for (const L of graph.layers) {
    const x = B[L.i[0]];
    let r;
    switch (L.t) {
      case "in": r = [T(3, S, S, input)]; break;
      case "conv": case "dw": r = [conv(x, L, W)]; break;
      case "gn": r = [groupNorm(x, L, W)]; break;
      case "ln": r = [layerNorm(x, L, W)]; break;
      case "maxpool": r = [maxpool(x)]; break;
      case "gelu": r = [gelu(x)]; break;
      case "sigmoid": r = [sigmoid(x)]; break;
      case "split": r = L.o.map(() => x); break;
      case "perm": r = [permute(x, L.order)]; break;
      case "slice": r = slice(x, L.o.length); break;
      case "const": r = [T(L.c, L.h, L.w, W.subarray(L.D[0], L.D[0] + L.D[1]))]; break;
      case "bin": r = [binary(x, B[L.i[1]], L.op)]; break;
      case "concat": r = [concat(L.i.map((i) => B[i]))]; break;
      case "interp": r = [interp(x, L)]; break;
      default: throw new Error("couche inconnue : " + L.t);
    }
    L.o.forEach((o, k) => { B[o] = r[k]; });
    for (const i of L.i) if (--uses[i] === 0 && i !== graph.output) B[i] = null;
  }
  return B[graph.output].d;
}

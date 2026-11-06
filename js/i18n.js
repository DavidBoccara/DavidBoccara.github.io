// Langue de l'interface : français (langue d'origine du site) ou anglais.
//
// Principe : le site reste écrit en français. En anglais, un traducteur surveille la page (MutationObserver) et
// remplace chaque texte affiché par sa traduction tirée de `en.js` (texte français exact → anglais, ou modèle avec
// des trous {1}, {2}… pour les phrases qui contiennent des nombres ou des noms). Une phrase sans traduction reste
// en français : rien ne casse. En français, rien de tout ça ne tourne (en.js n'est même pas chargé).
//
// Choix : réglage « Langue » du Profil (clé `lang`), sinon langue du téléphone (français si elle commence par « fr »).

const KEY = "lang";

export const LANG = (() => {
  try { const v = localStorage.getItem(KEY); if (v === "fr" || v === "en") return v; } catch { /* stockage bloqué */ }
  return String(navigator.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
})();

/** Langue pour les dates et les nombres (Intl, toLocaleString…). */
export const LOCALE = LANG === "en" ? "en-GB" : "fr-FR";
/** Séparateur décimal (virgule en français, point en anglais). */
export const DEC = LANG === "en" ? "." : ",";
/** Langue de Wikipédia et de Wikidata. */
export const WIKI_LANG = LANG;

export function setLang(lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* stockage bloqué */ }
  location.reload();
}

let EXACT = null;      // Map texte français → anglais
let PATTERNS = [];     // [{ re, en, size }] pour les phrases à trous
const cache = new Map();

/** Traduction d'un texte (appel direct, pour ce qui n'est pas affiché dans la page : notifications, titre…). */
export function t(text) {
  if (LANG === "fr" || text == null) return text;
  return translate(String(text)) ?? text;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function build(entries) {
  EXACT = new Map();
  for (const [fr, en] of entries) {
    if (!fr || en == null) continue;
    if (/\{\d\}/.test(fr)) {
      const parts = fr.trim().split(/\{\d\}/);
      const order = [...fr.matchAll(/\{(\d)\}/g)].map((m) => Number(m[1]));
      // Un trou ne déborde jamais sur la ligne suivante (sinon un modèle avalerait tout un texte de plusieurs lignes)
      const re = new RegExp("^" + parts.map(escape).join("([^\\n]*?)") + "$");
      PATTERNS.push({ re, en, order, size: parts.join("").length, leading: parts[0] === "" });
    } else EXACT.set(fr.trim(), en);
  }
  // Les modèles les plus précis (le plus de texte fixe) d'abord
  PATTERNS.sort((a, b) => b.size - a.size);
}

/** Texte connu tel quel, à un point final près (« Phrase. » ↔ « Phrase »). */
function exact(k) {
  let r = EXACT.get(k);
  if (r != null) return r;
  if (/[.!]$/.test(k)) {
    r = EXACT.get(k.slice(0, -1));
    if (r != null) return /[.!?]$/.test(r) ? r : r + k.slice(-1);
  } else {
    r = EXACT.get(k + ".");
    if (r != null) return r.replace(/\.$/, "");
  }
  return null;
}

/** Traduit chaque morceau ; null si aucun n'est connu. */
function pieces(parts, sep) {
  let changed = false;
  const res = parts.map((p) => { if (!p.trim() || /^\n+$/.test(p)) return p; const r = translate(p); if (r != null) changed = true; return r ?? p; });
  return changed ? res.join(sep) : null;
}

/** Modèle à trous qui colle le mieux (le moins de texte dans les trous). leading : ceux qui commencent par un trou. */
function byPattern(k, leading) {
  let best = null, bestLen = Infinity;
  for (const p of PATTERNS) {
    if (p.leading !== leading || k.length < p.size) continue;
    const m = p.re.exec(k);
    if (!m) continue;
    const len = k.length - p.size;
    if (len < bestLen) { best = [p, m]; bestLen = len; }
  }
  if (!best) return null;
  const [p, m] = best;
  // Trous remplis dans l'ordre du modèle français ; chaque morceau est traduit à son tour (ex. un type d'avion)
  const vals = {};
  p.order.forEach((n, i) => { vals[n] = m[i + 1]; });
  return p.en.replace(/\{(\d)\}/g, (_, n) => { const v = vals[n] ?? ""; return translate(v) ?? v; });
}

/** Renvoie la traduction anglaise, ou null si le texte n'est pas connu. */
function translate(text) {
  const k = text.trim();
  if (!k || !/[A-Za-zÀ-ÿ]/.test(k)) return null;
  if (cache.has(text)) return cache.get(text);
  let out = exact(k);
  // 1) modèles qui commencent par du texte fixe (les plus sûrs) ; 2) découpages ; 3) modèles qui commencent par un trou
  if (out == null) out = byPattern(k, false);
  // Point final en plus ou en moins pour un modèle à trous
  if (out == null && /[.!]$/.test(k) && k.length > 2) {
    const r = byPattern(k.slice(0, -1), false) ?? byPattern(k.slice(0, -1), true);
    if (r != null) out = /[.!?]$/.test(r) ? r : r + k.slice(-1);
  }
  // Plusieurs paragraphes : chacun traduit séparément
  if (out == null && k.includes("\n")) out = pieces(k.split(/(\n+)/), "");
  // Plusieurs phrases assemblées : chacune traduite séparément
  if (out == null && /[.!?:]\s+\S/.test(k)) {
    const parts = k.split(/(?<=[.!?:])\s+/);
    if (parts.length > 1) out = pieces(parts, " ");
  }
  if (out == null) out = byPattern(k, true);
  if (out != null) out = text.slice(0, text.indexOf(k)) + out + text.slice(text.indexOf(k) + k.length);
  if (cache.size > 5000) cache.clear();
  cache.set(text, out ?? null);
  return out ?? null;
}

// ---------- Traduction de la page ----------
const done = new WeakMap(); // nœud → dernier texte posé par le traducteur (évite de traduire deux fois)
const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE"]);

function skipNode(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (SKIP.has(e.tagName) || e.isContentEditable || e.hasAttribute?.("data-notr")) return true;
  }
  return false;
}

function doText(node) {
  if (done.get(node) === node.data) return;
  const parent = node.parentElement;
  if (!parent || skipNode(parent)) return;
  const out = translate(node.data);
  if (out != null && out !== node.data) { node.data = out; }
  done.set(node, node.data);
}

function doAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (!v) continue;
    const out = translate(v);
    if (out != null && out !== v) el.setAttribute(a, out);
  }
}

function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1 || skipNode(root)) return;
  doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) doText(n); else doAttrs(n);
  }
}

function start() {
  document.documentElement.lang = "en";
  const fixTitle = () => { const tt = translate(document.title); if (tt && tt !== document.title) document.title = tt; };
  walk(document.body); fixTitle();
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doAttrs(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  new MutationObserver(fixTitle).observe(document.querySelector("title") || document.head, { childList: true, subtree: true, characterData: true });
}

if (LANG === "en") {
  try {
    const { EN } = await import("./en.js");
    build(EN);
    if (document.body) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });
  } catch (e) {
    console.warn("Traduction anglaise indisponible", e); // le site reste en français
  }
}

// Image de partage d'une capture (réseaux sociaux) : la photo du joueur en grand + un bandeau Plane GO (style
// « Instrument ») avec le modèle, la rareté, les XP, l'avion (compagnie, immatriculation, vol), le trajet, le logo et plane-go.com, au format
// 1080 × 1350 (portrait 4:5, celui d'Instagram et de Facebook). Si l'image ne peut pas être fabriquée (photo
// illisible…), le partage se fait avec la photo seule.
import { LANG } from "./i18n.js";
import { airlineOf } from "./game.js";

const W = 1080, H = 1350, BAND = 480, FACTS_H = 92, PAD = 64;
const C = { bg: "#0F1113", line: "#2A2E33", text: "#F2F3F5", dim: "#9AA1A9", soft: "#C9CDD2", accent: "#F2A93B", mil: "#E5484D", empty: "#2A2E33" };
const SANS = '"IBM Plex Sans", system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';
const EN = LANG === "en", ES = LANG === "es";
const T = (fr, en, es) => (EN ? en : ES ? es : fr);

/** Couleur d'une rareté (variable CSS → valeur), ambre si inconnue. */
function rarityColor(r) {
  const v = String(r?.color || "").match(/var\((--[\w-]+)\)/);
  const c = v ? getComputedStyle(document.documentElement).getPropertyValue(v[1]).trim() : r?.color;
  return c || C.accent;
}

async function loadBitmap(url) {
  const blob = await fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); });
  return createImageBitmap(blob);
}
function loadImage(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

/** Texte coupé avec « … » pour tenir dans la largeur. */
function fit(ctx, s, max) {
  if (ctx.measureText(s).width <= max) return s;
  while (s.length > 1 && ctx.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}

/** L'avion photographié (demandé par le propriétaire le 11/11/2026) : [étiquette, valeur, police] des infos connues. */
function aircraftFacts(info) {
  const airline = airlineOf(info.callsign); // nom propre de la compagnie d'après l'indicatif, sinon l'opérateur noté
  return [
    [airline ? T("COMPAGNIE", "AIRLINE", "AEROLÍNEA") : T("OPÉRATEUR", "OPERATOR", "OPERADOR"), airline?.name || info.operator, SANS],
    [T("IMMATRICULATION", "REGISTRATION", "MATRÍCULA"), info.registration, MONO],
    [T("VOL", "FLIGHT", "VUELO"), info.callsign, MONO],
  ].filter(([, v]) => v && String(v).trim());
}
/** Une colonne par info (étiquette en capitales, valeur dessous) ; la 1re (compagnie) prend la place qui reste. */
function drawFacts(ctx, facts, y) {
  const GAP = 56, LABEL = `500 22px ${MONO}`, value = (f) => `500 34px ${f}`;
  const label = (s, x, max) => { ctx.font = LABEL; ctx.letterSpacing = "3px"; const t = fit(ctx, s, max); if (x != null) ctx.fillText(t, x, y);
    const w = ctx.measureText(t).width; ctx.letterSpacing = "0px"; return w; };
  const ws = facts.map(([l, v, f]) => { const a = label(l, null, Infinity); ctx.font = value(f); return Math.max(a, ctx.measureText(String(v)).width); });
  const room = W - 2 * PAD - ws.slice(1).reduce((s, w) => s + w + GAP, 0);
  let x = PAD;
  facts.forEach(([l, v, f], i) => {
    const w = i ? ws[i] : Math.max(120, Math.min(ws[0], room));
    ctx.fillStyle = C.dim; label(l, x, w);
    ctx.font = value(f); ctx.fillStyle = C.soft; ctx.fillText(fit(ctx, String(v).trim(), w), x, y + 32);
    x += w + GAP;
  });
}
/**
 * Fabrique l'image de partage. info = { mine, player, model, rarity, xp, route, military, operator, registration, callsign }.
 * Renvoie une adresse blob: (JPEG) ou null si impossible.
 */
export async function shareCard(photoUrl, info) {
  try {
    if (!photoUrl) return null;
    await Promise.all([`600 64px ${SANS}`, `400 30px ${SANS}`, `500 28px ${MONO}`].map((f) => document.fonts?.load(f).catch(() => {})));
    const [photo, logo] = await Promise.all([loadBitmap(photoUrl), loadImage("icons/logo.svg")]);
    const cv = Object.assign(document.createElement("canvas"), { width: W, height: H });
    const ctx = cv.getContext("2d");
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

    // Photo en haut, recadrée pour remplir la zone (centre gardé) ; bandeau un peu plus haut s'il y a les infos de l'avion
    const facts = aircraftFacts(info);
    const ph = H - BAND - (facts.length ? FACTS_H : 0), s = Math.max(W / photo.width, ph / photo.height);
    const sw = W / s, sh = ph / s;
    ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, 0, 0, W, ph);
    ctx.fillStyle = C.line; ctx.fillRect(0, ph, W, 2);

    let y = ph + PAD;
    ctx.textBaseline = "top";
    // Étiquette : qui l'a attrapé
    ctx.font = `500 28px ${MONO}`; ctx.fillStyle = C.accent;
    const who = info.mine ? (EN ? "CAUGHT WITH PLANE GO" : ES ? "ATRAPADO CON PLANE GO" : "ATTRAPÉ AVEC PLANE GO")
      : (EN ? `CAUGHT BY ${String(info.player || "A FRIEND").toUpperCase()}` : ES ? `ATRAPADO POR ${String(info.player || "UN AMIGO").toUpperCase()}`
        : `ATTRAPÉ PAR ${String(info.player || "UN AMI").toUpperCase()}`);
    ctx.letterSpacing = "4px"; ctx.fillText(fit(ctx, who, W - 2 * PAD), PAD, y); ctx.letterSpacing = "0px";
    y += 52;

    // Modèle (+ MIL)
    ctx.font = `600 64px ${SANS}`; ctx.fillStyle = C.text;
    const milW = info.military ? 110 : 0;
    const model = fit(ctx, info.model || (EN ? "An aircraft" : "Un avion"), W - 2 * PAD - milW);
    ctx.fillText(model, PAD, y);
    if (info.military) {
      const x = PAD + ctx.measureText(model).width + 22;
      ctx.strokeStyle = C.mil; ctx.lineWidth = 3; ctx.strokeRect(x, y + 14, 84, 46);
      ctx.font = `500 26px ${MONO}`; ctx.fillStyle = C.mil; ctx.fillText("MIL", x + 18, y + 22);
    }
    y += 96;

    // Rareté : 5 barres + libellé + XP
    const r = info.rarity || {}, col = rarityColor(r), n = (r.ordinal ?? 0) + 1;
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i < n ? col : C.empty; ctx.fillRect(PAD + i * 22, y + 2, 14, 36); }
    ctx.font = `600 34px ${SANS}`; ctx.fillStyle = col;
    const label = EN ? ({ COMMUN: "Common", PEU_COMMUN: "Uncommon", RARE: "Rare", EPIQUE: "Epic", LEGENDAIRE: "Legendary" }[r.key] || r.label || "") : (r.label || "");
    ctx.fillText(label, PAD + 130, y);
    if (info.xp > 0) {
      const lx = PAD + 130 + ctx.measureText(label).width;
      ctx.font = `500 30px ${MONO}`; ctx.fillStyle = C.dim; ctx.fillText(`  ·  +${info.xp} XP`, lx, y + 4);
    }
    y += 62;

    // L'avion : compagnie, immatriculation, vol
    if (facts.length) { drawFacts(ctx, facts, y); y += FACTS_H; }

    // Trajet
    if (info.route) {
      ctx.font = `400 30px ${SANS}`; ctx.fillStyle = C.dim;
      ctx.fillText(fit(ctx, info.route, W - 2 * PAD), PAD, y);
      y += 50;
    }

    // Pied : logo + adresse
    const footY = H - PAD - 64;
    if (logo) ctx.drawImage(logo, PAD, footY, 64, 64);
    ctx.font = `600 40px ${SANS}`; ctx.fillStyle = C.text; ctx.fillText("Plane GO", PAD + 84, footY + 10);
    ctx.font = `500 32px ${MONO}`; ctx.fillStyle = C.accent; ctx.textAlign = "right";
    ctx.fillText("plane-go.com", W - PAD, footY + 16); ctx.textAlign = "left";

    const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.9));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null; // photo illisible (autre site sans autorisation…) : partage avec la photo seule
  }
}

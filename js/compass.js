// Rose des vents façon radar (Scanner et fiche d'un avion) : N, E, S, O. Avec la boussole du téléphone, elle tourne
// pour que le N montre le vrai nord (téléphone tenu à plat) ; sinon, le nord est en haut.
// Écran radar : vous êtes au centre, cercles de distance, faisceau qui tourne quand le radar est démarré (setSweep).
// Repères : points de couleur = avions (plus près du centre = plus près de vous) ; point ambre plein = l'avion de la fiche ;
// petit cercle ambre = où il entrera dans la zone visible (cercle pointillé), relié à l'avion par un trait (son sens).
import { h, modal, cardinal } from "./util.js";

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const PLOT = 36; // rayon de l'écran radar (le bord = la zone de détection)
/** Coordonnées sur l'écran : cap en degrés, distance relative r de 0 (centre) à 1 (bord). */
const at = (deg, r) => {
  const a = (deg * Math.PI) / 180, d = 4 + (PLOT - 4) * clamp01(r ?? 1);
  return [50 + d * Math.sin(a), 50 - d * Math.cos(a)];
};
const f = (n) => n.toFixed(1);
/** Secteur du faisceau (de 0° vers -deg, sens inverse des aiguilles) */
const sector = (deg) => {
  const a = (-deg * Math.PI) / 180;
  return `M50 50 L50 ${50 - PLOT} A${PLOT} ${PLOT} 0 0 0 ${f(50 + PLOT * Math.sin(a))} ${f(50 - PLOT * Math.cos(a))} Z`;
};

/**
 * Repère « où il apparaîtra » d'un avion qui approche (a = approach() de game.js), relié à l'avion par un trait :
 * sur le cercle de la zone visible (SOON), au point le plus proche s'il passe plus loin (FAR), sur l'avion s'il est déjà visible (NOW).
 * visKm : zone visible à l'œil nu ; radiusKm : zone de détection (bord du radar).
 */
export function nextMark(ac, a, visKm, radiusKm) {
  if (!a || a.kind === "AWAY" || a.kind === "LANDS" || !Number.isFinite(a.lookDeg) || !(radiusKm > 0)) return null;
  const here = ac.bearingDeg != null && ac.distanceKm != null ? { deg: ac.bearingDeg, r: ac.distanceKm / radiusKm } : null;
  const r = a.kind === "NOW" ? (here ? here.r : visKm / radiusKm) : a.kind === "FAR" ? a.closest / radiusKm : visKm / radiusKm;
  return { deg: a.lookDeg, kind: "next", r, from: here };
}

/** size : largeur en pixels ; explain : texte de la fenêtre d'aide (toucher la rose). */
export function compassRose({ size = 84, explain = "Le petit cercle orange indique où regarder pour le prochain avion visible." } = {}) {
  // Graduations tous les 22,5° sur le bord, sauf aux points cardinaux (les lettres N, E, S, O y sont)
  const ticks = Array.from({ length: 16 }, (_, i) => {
    if (i % 4 === 0) return "";
    const a = (i * 22.5 * Math.PI) / 180, r1 = i % 2 ? 42 : 39.5;
    return `<line class="tick" x1="${f(50 + r1 * Math.sin(a))}" y1="${f(50 - r1 * Math.cos(a))}" x2="${f(50 + 45.5 * Math.sin(a))}" y2="${f(50 - 45.5 * Math.cos(a))}"/>`;
  }).join("");
  const ranges = [1 / 3, 2 / 3].map((r) => `<circle class="range" cx="50" cy="50" r="${f(4 + (PLOT - 4) * r)}"/>`).join("");
  const svg = `<svg class="compass radar" viewBox="0 0 100 100" aria-hidden="true" style="width:${size}px;height:${size}px">
    <circle class="ring" cx="50" cy="50" r="47.5"/>
    <circle class="screen" cx="50" cy="50" r="${PLOT}"/>
    ${ranges}
    <circle class="vis-zone" cx="50" cy="50" r="0" style="display:none"/>
    <g class="sweep"><path class="trail t3" d="${sector(55)}"/><path class="trail t2" d="${sector(30)}"/><path class="trail t1" d="${sector(12)}"/>
      <line class="beam" x1="50" y1="50" x2="50" y2="${50 - PLOT}"/></g>
    <g class="dial">${ticks}
      <path class="cross" d="M50 ${50 - PLOT}V${50 + PLOT}M${50 - PLOT} 50H${50 + PLOT}"/>
      <text class="lbl n" x="50" y="9.5">N</text><text class="lbl" x="90.5" y="50">E</text>
      <text class="lbl" x="50" y="90.5">S</text><text class="lbl" x="9.5" y="50">O</text>
      <g class="marks"></g>
    </g>
    <circle class="me" cx="50" cy="50" r="1.8"/>
    <path class="phone" d="M50 0.5 v4" style="display:none"/>
  </svg>`;
  const cap = h("div.compass-cap", "Nord en haut");
  const el = h("div.compass-box", { html: svg, title: "Rose des vents", style: { width: `${size + 8}px` } }, cap);
  const dial = el.querySelector(".dial"), marksG = el.querySelector(".marks"), phone = el.querySelector(".phone");
  const visZone = el.querySelector(".vis-zone");
  let heading = null, shown = 0, marks = [], caption = null, opts = {}, frame = 0, live = false;
  const needsPermission = typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";

  /** Trait entre l'avion (point plein) et l'endroit où il apparaîtra (petit cercle), raccourci aux deux bouts. */
  function link(from, to) {
    const [x1, y1] = at(from.deg, from.r), [x2, y2] = at(to.deg, to.r);
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 9) return ""; // l'avion est déjà dans le cercle
    const ux = dx / len, uy = dy / len;
    return `<line class="track" x1="${f(x1 + ux * 3.6)}" y1="${f(y1 + uy * 3.6)}" x2="${f(x2 - ux * 4.8)}" y2="${f(y2 - uy * 4.8)}"/>`;
  }

  function draw() {
    frame = 0;
    // Rotation la plus courte (évite le tour complet entre 359° et 0°)
    const want = -(heading ?? 0);
    shown += ((((want - shown) % 360) + 540) % 360) - 180;
    dial.style.transform = `rotate(${shown}deg)`;
    phone.style.display = heading != null ? "" : "none";
    // Zone visible à l'œil nu (cercle pointillé)
    const vis = Number.isFinite(opts.visible) ? clamp01(opts.visible) : null;
    visZone.style.display = vis != null && vis < 1 ? "" : "none";
    if (vis != null) visZone.setAttribute("r", f(4 + (PLOT - 4) * vis));
    // Points des avions de la liste, puis le trait et les repères principaux (au-dessus)
    const ok = marks.filter((m) => m && Number.isFinite(m.deg));
    const now = ok.find((m) => m.kind === "now");
    let html = ok.filter((m) => m.kind === "dot").map((m) => {
      const [x, y] = at(m.deg, m.r);
      return `<circle class="dot" cx="${f(x)}" cy="${f(y)}" r="3" style="fill:${esc(m.color || "var(--accent)")}"/>`;
    }).join("");
    for (const m of ok.filter((k) => k.kind === "next")) {
      const from = m.from && Number.isFinite(m.from.deg) ? m.from : now;
      if (from) html += link(from, m);
    }
    html += ok.filter((m) => m.kind !== "dot").map((m) => {
      const [x, y] = at(m.deg, m.r);
      return m.kind === "next" ? `<circle class="target-ring" cx="${f(x)}" cy="${f(y)}" r="4.5"/>`
        : `<circle class="target" cx="${f(x)}" cy="${f(y)}" r="3.6"/>`;
    }).join("");
    marksG.innerHTML = html;
    const where = caption ? `<b>${esc(caption.label)}</b><br>${cardinal(caption.deg)} · ${Math.round(caption.deg) % 360}°` : "";
    const hint = heading != null ? "" : needsPermission && !live ? "Touchez pour activer la boussole<br>" : "Nord en haut<br>";
    cap.innerHTML = hint + where;
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };

  // Cap du téléphone : boussole absolue (Android) ou webkitCompassHeading (iPhone)
  const screenAngle = () => screen.orientation?.angle ?? window.orientation ?? 0;
  const onAbs = (e) => { if (e.alpha == null) return; live = true; heading = (360 - e.alpha + screenAngle()) % 360; schedule(); };
  const onIos = (e) => {
    const hd = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null);
    if (hd == null) return;
    live = true; heading = (hd + screenAngle()) % 360; schedule();
  };
  if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", onAbs);
  else window.addEventListener("deviceorientation", onIos); // iPhone : après l'autorisation (toucher la rose)
  el.addEventListener("click", async () => {
    if (needsPermission && !live) {
      try { await DeviceOrientationEvent.requestPermission(); } catch { /* refusé ou inutile */ }
    }
    modal({ title: "Rose des vents", body: (live
      ? "La rose tourne avec votre téléphone : tenez-le à plat, le N rouge montre le nord. "
      : "La boussole du téléphone n'est pas disponible : le nord est en haut (cap 0° = nord, 90° = est, 180° = sud, 270° = ouest). ")
      + "Vous êtes au centre ; le bord du radar correspond à votre zone de détection et le cercle pointillé à la zone visible à l'œil nu. " + explain });
  });
  draw();
  return {
    el,
    /**
     * marks : [{ deg, kind, r }] — "dot" (petit point de couleur `color`), "now" (point ambre plein) ou "next" (petit cercle :
     * où l'avion apparaîtra ; relié par un trait à `from` {deg, r}, sinon au point "now"). r = distance relative, de 0 (centre)
     * à 1 (bord = zone de détection) ; sans r, sur le bord. caption : { label, deg } sous la rose.
     * options : { visible } = rayon de la zone visible à l'œil nu (relatif, cercle pointillé).
     */
    setMarks(m, c = null, o = {}) { marks = m || []; caption = c; opts = o || {}; schedule(); },
    /** Faisceau qui tourne : seulement quand le radar est démarré. */
    setSweep(on) { el.querySelector("svg")?.classList.toggle("sweeping", !!on); },
    stop() {
      window.removeEventListener("deviceorientationabsolute", onAbs);
      window.removeEventListener("deviceorientation", onIos);
      if (frame) cancelAnimationFrame(frame);
    },
  };
}

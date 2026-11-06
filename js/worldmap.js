// Carte du monde des jeux (projection de Mercator, terres et frontières Natural Earth, domaine public : worldmap-data.js).
import { LOCALE } from "./i18n.js";
import { h } from "./util.js";
let mapData = null;
/** Données de la carte (≈ 190 Ko), chargées seulement quand un jeu en a besoin. */
export const loadMap = () => (mapData ||= import("./worldmap-data.js"));

/**
 * Carte du monde SVG (Mercator) : glisser, pincer, molette, + / −.
 * onTap(lon, lat, at) : toucher bref ; at.px(lon, lat) = distance en pixels écran entre ce point et le toucher.
 * Repères : {type:"line", points:[[lon,lat]…], cls}, {type:"dot", lon, lat, r, cls}, {type:"plane", lon, lat, deg, cls, label}.
 */
export function worldMap(M, { onTap, label = "Carte du monde" } = {}) {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const toXY = (lon, lat) => {
    const la = Math.max(M.LAT_MIN, Math.min(M.LAT_MAX, lat)) * Math.PI / 180;
    return [(lon + 180) * 10, (M.YMAX - Math.log(Math.tan(Math.PI / 4 + la / 2)) * 180 / Math.PI) * 10];
  };
  const fromXY = (x, y) => [x / 10 - 180, (2 * Math.atan(Math.exp((M.YMAX - y / 10) * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI];
  const svg = el("svg", { class: "wmap-svg", role: "img", "aria-label": label });
  const grat = el("g", { class: "wmap-grat" });
  for (let lon = -150; lon <= 150; lon += 30) { const [x] = toXY(lon, 0); grat.append(el("line", { x1: x, y1: 0, x2: x, y2: M.MAP_H })); }
  for (const lat of [-30, 0, 30, 60]) { const [, y] = toXY(0, lat); grat.append(el("line", { x1: 0, y1: y, x2: M.MAP_W, y2: y })); }
  svg.append(el("rect", { class: "wmap-sea", x: 0, y: 0, width: M.MAP_W, height: M.MAP_H }), grat,
    el("path", { class: "wmap-land", d: M.LAND }), el("path", { class: "wmap-borders", d: M.BORDERS }));
  const layer = el("g");
  svg.append(layer);
  // Échelle en bas à gauche (longueur ronde : 1, 2 ou 5 × 10^n km, 90 px au plus)
  const scaleBar = h("span.bar"), scaleTxt = h("span.txt");
  const box = h("div.wmap", svg, h("div.wmap-scale", { "aria-hidden": "true" }, scaleBar, scaleTxt),
    h("div.wmap-zoom",
      h("button", { type: "button", "aria-label": "Zoomer", onclick: () => zoomBy(0.6) }, "+"),
      h("button", { type: "button", "aria-label": "Dézoomer", onclick: () => zoomBy(1 / 0.6) }, "−")));

  // Vue : rectangle visible de la carte (unités de la carte), rapport largeur/hauteur de la boîte
  let view = { x: 0, y: 0, w: M.MAP_W, h: M.MAP_H };
  const aspect = () => (box.clientWidth || 360) / (box.clientHeight || 270);
  const clamp = () => {
    view.w = Math.min(M.MAP_W, Math.max(6, view.w)); view.h = view.w / aspect();
    if (view.h > M.MAP_H) { view.h = M.MAP_H; view.w = view.h * aspect(); }
    view.x = Math.min(Math.max(view.x, Math.min(0, M.MAP_W - view.w)), Math.max(0, M.MAP_W - view.w));
    view.y = Math.min(Math.max(view.y, 0), Math.max(0, M.MAP_H - view.h));
  };
  const apply = () => { clamp(); svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`); drawMarks(); drawScale(); };
  function drawScale() {
    const [, lat] = fromXY(view.x + view.w / 2, view.y + view.h / 2);
    const kmPerPx = unitsPerPx() * 0.1 * 111.32 * Math.cos((lat * Math.PI) / 180);
    if (!(kmPerPx > 0)) return;
    const max = kmPerPx * 90, p = 10 ** Math.floor(Math.log10(max));
    const km = [5, 2, 1].map((k) => k * p).find((v) => v <= max) || p;
    scaleBar.style.width = `${Math.round(km / kmPerPx)}px`;
    scaleTxt.textContent = `${km >= 1 ? km.toLocaleString(LOCALE) : km.toFixed(1).replace(".", ",")} km`;
  }
  const unitsPerPx = () => view.w / (box.clientWidth || 360);
  function zoomBy(f, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    const nw = Math.min(M.MAP_W, Math.max(6, view.w * f)), k = nw / view.w;
    view = { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w: nw, h: nw / aspect() };
    apply();
  }
  /** Cadre la vue sur ces points (longitude, latitude), avec une marge. */
  function fit(points, minKm = 600) {
    const xy = points.map(([lon, lat]) => toXY(lon, lat));
    let x0 = Math.min(...xy.map((p) => p[0])), x1 = Math.max(...xy.map((p) => p[0]));
    let y0 = Math.min(...xy.map((p) => p[1])), y1 = Math.max(...xy.map((p) => p[1]));
    const minW = minKm / 111 * 10;
    const w = Math.max(x1 - x0, (y1 - y0) * aspect(), minW) * 1.35;
    view = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w / aspect() / 2, w, h: w / aspect() };
    apply();
  }

  // Repères (redessinés à chaque changement de vue pour garder une taille fixe à l'écran)
  let marks = [];
  function drawMarks() {
    const u = unitsPerPx();
    layer.replaceChildren(...marks.map((m) => {
      if (m.type === "area") {
        const d = m.points.map(([lon, lat], i) => { const [x, y] = toXY(lon, lat); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join("") + "Z";
        return el("path", { d, class: "wmap-area " + (m.cls || ""), "vector-effect": "non-scaling-stroke" });
      }
      if (m.type === "line") {
        const d = m.points.map(([lon, lat], i) => { const [x, y] = toXY(lon, lat); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join("");
        return el("path", { d, class: "wmap-line " + (m.cls || ""), "vector-effect": "non-scaling-stroke" });
      }
      const [x, y] = toXY(m.lon, m.lat);
      if (m.type === "plane") {
        const s = m.size || 1;
        const outer = el("g", { transform: `translate(${x} ${y}) scale(${u})` });
        const g = el("g", { transform: `rotate(${m.deg || 0}) scale(${s})` });
        g.append(el("path", { class: "wmap-plane " + (m.cls || ""), d: "M0-11 L3-3 L11 2 L11 4 L3 2 L2 8 L5 10 L5 11 L0 10 L-5 11 L-5 10 L-2 8 L-3 2 L-11 4 L-11 2 L-3-3 Z" }));
        outer.append(g);
        if (m.label) {
          const t = el("text", { class: "wmap-label " + (m.cls || ""), x: 13 * s, y: -9 * s });
          t.textContent = m.label;
          outer.append(t);
        }
        return outer;
      }
      return el("circle", { cx: x, cy: y, r: (m.r || 5) * u, class: "wmap-dot " + (m.cls || ""), "vector-effect": "non-scaling-stroke" });
    }));
  }
  const setMarks = (list) => { marks = list; drawMarks(); };

  // Doigt / souris : glisser = déplacer, deux doigts ou molette = zoomer, toucher bref = choisir un point
  const pts = new Map();
  let start = null, pinch = null;
  const local = (e) => { const r = svg.getBoundingClientRect(); return [view.x + (e.clientX - r.left) * view.w / r.width, view.y + (e.clientY - r.top) * view.h / r.height]; };
  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) start = { x: e.clientX, y: e.clientY, t: Date.now(), view: { ...view }, moved: false };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: view.w }; start && (start.moved = true); }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = svg.getBoundingClientRect(), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const cx = view.x + (mx - r.left) * view.w / r.width, cy = view.y + (my - r.top) * view.h / r.height;
      zoomBy((pinch.w * pinch.d / Math.max(d, 1)) / view.w, cx, cy);
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > 6) start.moved = true;
    if (!start.moved) return;
    const k = start.view.w / (svg.getBoundingClientRect().width || 1);
    view = { ...start.view, x: start.view.x - dx * k, y: start.view.y - dy * k };
    apply();
  });
  const end = (e) => {
    const wasTap = pts.size === 1 && start && !start.moved && Date.now() - start.t < 600;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (wasTap && e.type === "pointerup") {
      const [x, y] = local(e); const [lon, lat] = fromXY(x, y);
      const px = (lo, la) => { const [a, b] = toXY(lo, la); return Math.hypot(a - x, b - y) / unitsPerPx(); };
      onTap?.(lon, lat, { px });
    }
    if (!pts.size) start = null;
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("wheel", (e) => { e.preventDefault(); const [x, y] = local(e); zoomBy(e.deltaY > 0 ? 1.2 : 1 / 1.2, x, y); }, { passive: false });
  const ro = new ResizeObserver(() => apply());
  ro.observe(box);
  apply();
  return { el: box, fit, setMarks, stop: () => ro.disconnect() };
}

/** Points d'un arc de grand cercle entre deux positions (pour tracer les trajets). */
export function arc(lat1, lon1, lat2, lon2, n = 48) {
  const r = Math.PI / 180, p1 = lat1 * r, l1 = lon1 * r, p2 = lat2 * r, l2 = lon2 * r;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (!d) return [[lon1, lat1], [lon2, lat2]];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r]);
  }
  return out;
}

/** Cercle de rayon km autour d'un point, en [lon, lat] (pour le tracer avec un repère "line"). */
export function ring(lat, lon, km, n = 72) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    out.push([lon + (km * Math.sin(a)) / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + (km * Math.cos(a)) / 111.32]);
  }
  return out;
}
/** Position (lon, lat) d'un avion dans t secondes, en ligne droite à sa vitesse sol. */
export function ahead(ac, t) {
  const km = (ac.speedKt * 1.852 * t) / 3600, r = (ac.trackDeg * Math.PI) / 180;
  return [ac.lon + (km * Math.sin(r)) / (111.32 * Math.cos((ac.lat * Math.PI) / 180)), ac.lat + (km * Math.cos(r)) / 111.32];
}
/** Point atteint en partant de (lat, lon) au cap brg (degrés) sur km kilomètres (grand cercle), en [lon, lat]. */
export function destPoint(lat, lon, brg, km) {
  const r = Math.PI / 180, d = km / 6371, p1 = lat * r, l1 = lon * r, b = brg * r;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [l2 / r, p2 / r];
}
/** Cône de direction : depuis (lat, lon), cap brg ± half degrés, jusqu'à km kilomètres ; et l'arc à reachKm dans ce cône. */
export function cone(lat, lon, brg, half, km, reachKm) {
  const edge = [];
  for (let i = 0; i <= 24; i++) edge.push(destPoint(lat, lon, brg - half + (2 * half * i) / 24, km));
  const reach = [];
  for (let i = 0; i <= 24; i++) reach.push(destPoint(lat, lon, brg - half + (2 * half * i) / 24, reachKm));
  return { area: [[lon, lat], ...edge], reach };
}

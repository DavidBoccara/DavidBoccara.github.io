// Sons de Plane GO, fabriqués sur place avec Web Audio (aucun fichier à télécharger).
// Principe « addictif » : chaque bonne réponse d'affilée monte d'une note (gamme pentatonique, toujours juste),
// les XP tintent comme des pièces (plus de points = plus de pièces), un palier de série et un nouveau grade
// ont leur fanfare, un avion attrapé déclenche l'obturateur puis une cascade d'autant plus longue qu'il est rare.
// Réglage « Sons » dans le Profil (clé `sound_on`, activé par défaut). Rien ne sonne appli en arrière-plan.

const KEY = "sound_on";
let ctx = null, master = null, echo = null;
let combo = 0;                // bonnes réponses d'affilée (tous les jeux confondus), remis à 0 par une erreur
let xpPending = 0, xpTimer = 0;
let lastEarnAt = 0;           // dernier gain d'XP : un nouveau grade n'est fêté que s'il vient d'un gain
let lastLevel = null;

export const Sound = {
  get on() { try { return localStorage.getItem(KEY) !== "false"; } catch { return true; } },
  set on(v) { try { localStorage.setItem(KEY, v ? "true" : "false"); } catch { /* bloqué */ } if (v) Sound.tap(); },

  /** Bonne ou mauvaise réponse (quiz, questions bonus, jeux de la carte). */
  answer(ok) {
    if (!ok) { combo = 0; wrong(); vibrate(60); return; }
    combo++;
    // Do ré mi sol la, octave après octave : la série se « joue » et donne envie de la continuer
    const step = Math.min(combo - 1, 11), base = 523.25 * Math.pow(2, PENTA[step % 5] / 12 + Math.floor(step / 5));
    at(0, () => note(base, 0.16, "triangle", 0.5));
    at(0.07, () => note(base * 1.5, 0.22, "sine", 0.4, true));
    if (combo % 5 === 0) at(0.18, () => fanfare(0.7)); // palier de série
    vibrate(combo % 5 === 0 ? [20, 40, 20, 40, 60] : 18);
  },

  /** Raté mais encore un essai : petit son grave, la série n'est pas encore perdue. */
  miss() { wrong(); vibrate(40); },

  /** Gain d'XP : pièces regroupées si plusieurs gains arrivent ensemble (points découpés par 50). */
  xp(points) {
    if (!(points > 0)) return;
    lastEarnAt = Date.now();
    xpPending += points;
    clearTimeout(xpTimer);
    xpTimer = setTimeout(() => { const p = xpPending; xpPending = 0; coins(p); }, 120);
  },

  /** Avion attrapé (photo validée) : obturateur puis cascade selon la rareté (0 = commun … 4 = légendaire). */
  catch(rarityOrdinal = 0) {
    lastEarnAt = Date.now();
    shutter();
    const n = 3 + Math.max(0, Math.min(4, rarityOrdinal)) * 2;
    for (let i = 0; i < n; i++) at(0.12 + i * 0.065, () => note(1046.5 * Math.pow(2, PENTA[i % 5] / 12 + Math.floor(i / 5)), 0.25, "sine", 0.32, true));
    if (rarityOrdinal >= 3) at(0.15 + n * 0.065, () => fanfare(0.8));
    vibrate([30, 50, 30]);
  },

  /** Appelé à chaque affichage des XP : fanfare si le grade monte juste après un gain. */
  level(number) {
    if (lastLevel != null && number > lastLevel && Date.now() - lastEarnAt < 8000) at(0.35, levelUp);
    lastLevel = number;
  },

  /** Radar : nouveaux avions dans la liste (petit écho de sonar). */
  blip() { note(1318.5, 0.09, "sine", 0.12); at(0.11, () => note(1318.5, 0.18, "sine", 0.05, true)); },

  /** Radar : un avion entre dans la zone visible, lève les yeux ! */
  contact() {
    at(0, () => note(880, 0.12, "square", 0.12));
    at(0.13, () => note(1174.7, 0.12, "square", 0.12));
    at(0.26, () => note(1760, 0.3, "sine", 0.3, true));
    vibrate([40, 60, 40]);
  },

  /** Petit clic (réglage activé). */
  tap() { note(1567.98, 0.05, "sine", 0.18); },
};

const PENTA = [0, 2, 4, 7, 9];

// ---------- Moteur ----------
function audio() {
  if (!Sound.on || document.visibilityState === "hidden") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55;
    // Petit écho clair : donne de la profondeur aux tintements sans fichier de réverbération
    echo = ctx.createDelay(); echo.delayTime.value = 0.14;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(master);
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Une note avec attaque rapide et chute douce ; `wet` = passe aussi dans l'écho. */
function note(freq, dur, type = "sine", vol = 0.3, wet = false) {
  const c = audio(); if (!c) return;
  const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); if (wet) g.connect(echo);
  o.start(t); o.stop(t + dur + 0.02);
}

const at = (s, fn) => (s ? setTimeout(fn, s * 1000) : fn());

function wrong() {
  // Deux notes graves qui descendent : on comprend tout de suite, sans être punitif
  at(0, () => note(311.1, 0.16, "triangle", 0.35));
  at(0.12, () => note(233.1, 0.3, "triangle", 0.3));
}

function coins(points) {
  // 1 pièce par tranche de 5 XP, 2 à 10 pièces, de plus en plus serrées
  const n = Math.max(2, Math.min(10, Math.round(points / 5)));
  for (let i = 0; i < n; i++) {
    const t = i * Math.max(0.045, 0.09 - i * 0.005);
    at(t, () => { note(987.8, 0.06, "square", 0.08); at(0.05, () => note(1318.5, 0.2, "sine", 0.22, i === n - 1)); });
  }
}

function fanfare(vol = 0.7) {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => at(i * 0.08, () => note(f, 0.32, "triangle", 0.28 * vol, true)));
}

function levelUp() {
  [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => at(i * 0.09, () => note(f, 0.4, "triangle", 0.3, true)));
  at(0.62, () => { note(1046.5, 0.9, "sine", 0.3, true); note(1318.5, 0.9, "sine", 0.22, true); note(1567.98, 0.9, "sine", 0.2, true); });
  vibrate([60, 60, 60, 60, 160]);
}

function shutter() {
  const c = audio(); if (!c) return;
  // Bruit blanc très court filtré = déclic d'appareil photo
  const len = Math.floor(c.sampleRate * 0.05), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = "bandpass"; f.frequency.value = 3200; f.Q.value = 0.8; g.gain.value = 0.9;
  src.connect(f); f.connect(g); g.connect(master); src.start();
}

function vibrate(p) {
  if (!Sound.on) return;
  try { navigator.vibrate?.(p); } catch { /* non pris en charge */ }
}

// Les navigateurs n'autorisent le son qu'après un premier toucher : on prépare le moteur à ce moment-là
const unlock = () => { if (Sound.on) audio(); };
window.addEventListener("pointerdown", unlock, { once: true, capture: true });
window.addEventListener("keydown", unlock, { once: true, capture: true });

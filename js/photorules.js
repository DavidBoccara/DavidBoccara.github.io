// Engagement obligatoire (Conditions d'utilisation, article 3) : photographier les avions seulement depuis des lieux
// publics, et jamais là où la photo est interdite (même si l'on a le droit d'y être).
// Demandé à la création du compte, au lancement pour les joueurs déjà inscrits, et avant toute photo.
// Gardé sur le téléphone par compte (clé photo_rules:<id>) et en ligne (RPC accept_photo_rules, supabase/photo_rules.sql).
// Pas de photo sans compte (mode invité) : voir requireAccount().
import { h, ls, modal } from "./util.js";
import { Supa } from "./supa.js";

// Version 2 (5 novembre 2026) : texte précisé (lieux où l'on peut être mais où la photo est interdite) → redemandé à tous
export const PHOTO_RULES_VERSION = 2;
export const PHOTO_RULES_TEXT = "Je m'engage à photographier les avions uniquement depuis des lieux publics où la photo "
  + "est autorisée. Je ne prends aucune photo là où c'est interdit, même si j'ai le droit de m'y trouver (zones militaires "
  + "ou sensibles, certaines zones d'aéroport, lieux signalés par un panneau…), et je n'entre jamais sur une propriété privée "
  + "ou un terrain interdit sans autorisation.";

const key = () => "photo_rules:" + (Supa.userId || "pending");
export const photoRulesAccepted = () => (ls.get(key(), 0) || 0) >= PHOTO_RULES_VERSION;

/** Enregistre l'engagement (téléphone + compte en ligne ; l'envoi en ligne est réessayé plus tard s'il échoue). */
export function acceptPhotoRules() {
  ls.set(key(), PHOTO_RULES_VERSION);
  syncPhotoRules();
}
export function syncPhotoRules() {
  // Engagement pris à la création du compte, avant que le compte existe : rattaché au compte dès la connexion
  if (Supa.userId && (ls.get("photo_rules:pending", 0) || 0) >= PHOTO_RULES_VERSION) { ls.set(key(), PHOTO_RULES_VERSION); ls.del("photo_rules:pending"); }
  const sentKey = "photo_rules_sent:" + Supa.userId;
  if (!photoRulesAccepted() || !Supa.isLoggedIn || ls.get(sentKey, 0) >= PHOTO_RULES_VERSION) return;
  Supa.rpc("accept_photo_rules", { p_version: PHOTO_RULES_VERSION })
    .then(() => ls.set(sentKey, PHOTO_RULES_VERSION)).catch(() => {});
}

/** Mode invité : pas de photo sans compte. Vrai si connecté ; sinon fenêtre qui propose de créer un compte. */
export function requireAccount() {
  if (Supa.isLoggedIn) return true;
  modal({
    title: "Crée un compte pour photographier",
    body: ["Les photos ne sont possibles qu'avec un compte Plane GO : chaque joueur s'engage à photographier les avions dans les règles, et ses photos sont rattachées à son compte.",
      "Le compte est gratuit et ne demande qu'un pseudo et une adresse e-mail."],
    buttons: [{ label: "Plus tard" }, { label: "Créer mon compte", primary: true, onClick: () => { location.hash = "#auth"; } }],
  });
  return false;
}

/** Avant une photo : vrai si l'engagement est déjà pris, sinon le demande (fenêtre, case à cocher obligatoire). */
export function ensurePhotoRules({ atStart = false } = {}) {
  if (photoRulesAccepted()) { syncPhotoRules(); return Promise.resolve(true); }
  return new Promise((resolve) => {
    let ok = false;
    const box = h("input", { type: "checkbox" });
    const accept = { label: "Je m'engage", primary: true, onClick: () => {
      if (!box.checked) { hint.textContent = "Coche la case pour continuer."; return false; }
      ok = true; acceptPhotoRules();
    } };
    const hint = h("div.small.mt", { style: { color: "var(--accent)" } });
    modal({
      title: "Photographier en règle",
      body: [
        h("p", atStart
          ? "Les règles de Plane GO changent : pour continuer à ajouter des photos, chaque joueur doit prendre cet engagement."
          : "Avant d'ajouter une photo, Plane GO te demande un engagement : c'est une condition pour jouer."),
        h("label.rules-check", box, h("span", PHOTO_RULES_TEXT)),
        hint,
        h("p.small.dim", "Voir les ", h("a", { href: "#terms" }, "Conditions d'utilisation"), " (article 3)."),
      ],
      buttons: [{ label: atStart ? "Plus tard" : "Annuler" }, accept],
      onClose: () => resolve(ok),
    });
  });
}
// Engagement pris hors connexion ou avant la création du compte : envoyé dès que le joueur est en ligne
window.addEventListener("planego-synced", syncPhotoRules);

/** Joueurs déjà inscrits : l'engagement est demandé au lancement (une fois par lancement s'il est remis à plus tard). */
let askedThisLaunch = false;
export function askPhotoRulesAtStart() {
  syncPhotoRules();
  if (askedThisLaunch || !Supa.isLoggedIn || photoRulesAccepted() || location.hash.startsWith("#auth")) return;
  askedThisLaunch = true;
  ensurePhotoRules({ atStart: true });
}

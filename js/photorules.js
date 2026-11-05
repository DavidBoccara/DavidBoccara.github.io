// Engagement obligatoire (Conditions d'utilisation, article 3) : photographier les avions seulement depuis des lieux
// publics ou des lieux où l'on a le droit d'être. Demandé à la création du compte et avant la première photo.
// Gardé sur le téléphone (clé photo_rules) et, si connecté, en ligne (RPC accept_photo_rules, supabase/photo_rules.sql).
import { h, ls, modal } from "./util.js";
import { Supa } from "./supa.js";

export const PHOTO_RULES_VERSION = 1;
export const PHOTO_RULES_TEXT = "Je m'engage à photographier les avions uniquement depuis des lieux publics (rue, parc, "
  + "point de vue ou terrasse ouverts au public…) ou des lieux où j'ai le droit d'être, sans entrer sur une propriété privée "
  + "sans autorisation, dans une zone réservée d'aéroport ou un terrain interdit, et en respectant les interdictions de photographier.";

export const photoRulesAccepted = () => (ls.get("photo_rules", 0) || 0) >= PHOTO_RULES_VERSION;

/** Enregistre l'engagement (téléphone + compte en ligne si connecté ; l'envoi en ligne est réessayé plus tard s'il échoue). */
export function acceptPhotoRules() {
  ls.set("photo_rules", PHOTO_RULES_VERSION);
  syncPhotoRules();
}
export function syncPhotoRules() {
  if (!photoRulesAccepted() || !Supa.isLoggedIn || ls.get("photo_rules_sent", 0) >= PHOTO_RULES_VERSION) return;
  Supa.rpc("accept_photo_rules", { p_version: PHOTO_RULES_VERSION })
    .then(() => ls.set("photo_rules_sent", PHOTO_RULES_VERSION)).catch(() => {});
}

/** Avant une photo : vrai si l'engagement est déjà pris, sinon le demande (fenêtre, case à cocher obligatoire). */
export function ensurePhotoRules() {
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
        h("p", "Avant ta première photo, Plane GO te demande un engagement : c'est une condition pour jouer."),
        h("label.rules-check", box, h("span", PHOTO_RULES_TEXT)),
        hint,
        h("p.small.dim", "Voir les ", h("a", { href: "#terms" }, "Conditions d'utilisation"), " (article 3)."),
      ],
      buttons: [{ label: "Annuler" }, accept],
      onClose: () => resolve(ok),
    });
  });
}
// Engagement pris hors connexion ou avant la création du compte : envoyé dès que le joueur est en ligne
window.addEventListener("planego-synced", syncPhotoRules);

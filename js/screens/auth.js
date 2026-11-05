// Connexion / création de compte, et « Nouveau mot de passe » (#auth/reset, après le lien « mot de passe oublié »).
import { h, toast, modal } from "../util.js";
import { Supa } from "../supa.js";
import { back, go, linkState } from "../app.js";
import { PHOTO_RULES_TEXT, acceptPhotoRules } from "../photorules.js";

export function authPage(view, [mode]) {
  if (mode === "reset") return resetPage(view);
  let signUp = false;
  const heading = h("p");
  const username = h("input.input", { autocomplete: "username", maxLength: 20 });
  const email = h("input.input", { type: "email", autocomplete: "email", inputMode: "email" });
  const password = h("input.input", { type: "password", autocomplete: "current-password" });
  const userField = h("label.field", h("span", "Pseudo"), username);
  const main = h("button.btn.primary.block.mt2");
  const switchBtn = h("button.btn.outline.block.mt");
  const form = h("form", { onsubmit: (e) => { e.preventDefault(); submit(); } },
    userField, h("label.field", h("span", "E-mail"), email), h("label.field", h("span", "Mot de passe"), password), main);
  // Création du compte = acceptation des Conditions d'utilisation (affiché seulement en mode « Créer mon compte »)
  // + engagement obligatoire de photographier depuis des lieux publics (photorules.js)
  const rulesBox = h("input", { type: "checkbox" });
  const terms = h("div.mt",
    h("label.rules-check", rulesBox, h("span", PHOTO_RULES_TEXT)),
    h("p.small.dim.mt", "En créant ton compte, tu acceptes les ", h("a", { href: "#terms" }, "Conditions d'utilisation"), "."));
  view.append(h("div.page-head", h("button.back", { onclick: back, "aria-label": "Retour" }, "‹"), h("h1.title.grow", "Mon compte")),
    heading, form, switchBtn, h("button.btn.block.mt", { style: { background: "none", color: "var(--dim)" }, onclick: forgot }, "Mot de passe oublié ?"),
    h("p.small.dim.mt2", "Votre compte fonctionne sur tous vos appareils : collection, XP, amis et feed vous suivent partout."),
    terms, h("p.small.dim", "Ce que nous gardons et comment tout effacer : ", h("a", { href: "#privacy" }, "Confidentialité"), "."));

  function render() {
    userField.style.display = signUp ? "" : "none";
    terms.style.display = signUp ? "" : "none";
    heading.textContent = signUp ? "Créez votre compte de spotter" : "Connectez-vous à votre compte";
    main.textContent = signUp ? "Créer mon compte" : "Se connecter";
    switchBtn.textContent = signUp ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? En créer un";
    password.autocomplete = signUp ? "new-password" : "current-password";
  }
  switchBtn.onclick = () => { signUp = !signUp; render(); };

  async function submit() {
    const mail = email.value.trim(), pass = password.value, name = username.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(mail)) return toast("E-mail invalide");
    if (pass.length < 6) return toast("Mot de passe : 6 caractères minimum");
    if (signUp && !/^[A-Za-z0-9_.-]{3,20}$/.test(name)) return toast("Pseudo : 3 à 20 caractères, lettres, chiffres, . _ -");
    if (signUp && !rulesBox.checked) return toast("Coche l'engagement de photographier depuis des lieux publics");
    if (signUp) acceptPhotoRules();
    main.disabled = true;
    try {
      if (signUp) {
        const ok = await Supa.signUp(mail, pass, name);
        if (!ok) { modal({ title: "Vérifiez vos e-mails", body: `Un lien de confirmation vous a été envoyé à ${mail}. Cliquez dessus, puis revenez vous connecter.` }); signUp = false; render(); return; }
      } else await Supa.signIn(mail, pass);
      toast("Bienvenue !");
      go("feed");
    } catch (e) { toast(e.message); } finally { main.disabled = false; }
  }
  async function forgot() {
    const mail = email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(mail)) return toast("Saisissez d'abord votre e-mail");
    try { await Supa.resetPassword(mail); toast(`E-mail de réinitialisation envoyé à ${mail}`); } catch (e) { toast(e.message); }
  }
  render();
}

/** Choix du nouveau mot de passe, après avoir ouvert le lien reçu par e-mail. */
function resetPage(view) {
  view.append(h("div.page-head", h("button.back", { onclick: () => go("auth"), "aria-label": "Retour" }, "‹"), h("h1.title.grow", "Nouveau mot de passe")));
  if (!Supa.isLoggedIn) {
    view.append(linkState.pending
      ? h("div.empty", "Vérification du lien…")
      : h("div", h("div.empty", "Ce lien n'est plus valable.\n\nTouche « Mot de passe oublié ? » sur la page de connexion pour recevoir un nouvel e-mail."),
        h("button.btn.primary.block", { onclick: () => go("auth") }, "Aller à la connexion")));
    return;
  }
  const pass = h("input.input", { type: "password", autocomplete: "new-password" });
  const again = h("input.input", { type: "password", autocomplete: "new-password" });
  const show = h("input", { type: "checkbox", onchange: (e) => { pass.type = again.type = e.target.checked ? "text" : "password"; } });
  const save = h("button.btn.primary.block.mt2", "Enregistrer mon nouveau mot de passe");
  view.append(
    h("p", "Choisis ton nouveau mot de passe" + (Supa.email ? ` pour ${Supa.email}` : "") + " :"),
    h("form", { onsubmit: (e) => { e.preventDefault(); submit(); } },
      h("label.field", h("span", "Nouveau mot de passe"), pass),
      h("label.field", h("span", "Encore une fois"), again),
      h("label.switch", h("span.small", "Afficher le mot de passe"), show), save),
    h("p.small.dim.mt", "6 caractères au minimum. Ensuite, connecte-toi avec ce mot de passe sur tes autres appareils (et dans l'appli Android)."));
  setTimeout(() => pass.focus(), 100);

  async function submit() {
    if (pass.value.length < 6) return toast("Mot de passe : 6 caractères minimum");
    if (pass.value !== again.value) return toast("Les deux mots de passe ne sont pas identiques");
    save.disabled = true;
    try {
      await Supa.updatePassword(pass.value);
      modal({ title: "Mot de passe changé", body: "C'est fait ! Tu es connecté avec ton nouveau mot de passe." });
      go("feed");
    } catch (e) { toast(e.message); } finally { save.disabled = false; }
  }
}

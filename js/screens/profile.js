// Onglet Profil : mon profil (pseudo, photo, grade, statistiques), mes amis et le classement.
import { h, ls, toast, prompt, pickImage, toJpeg, confirmBox, infoButton } from "../util.js";
import { Supa } from "../supa.js";
import { Cloud, sync } from "../cloud.js";
import { Collection, Player, entryModel, entryRarity, QuizStore } from "../store.js";
import { levelOf, modelKey } from "../game.js";
import { loginGate, renderHud, go } from "../app.js";
import { friends } from "./friends.js";
import { grades } from "./grades.js";
import { VERSION } from "../config.js";
import { installCard } from "../ui.js";
import { deleteAccountFlow } from "./privacy.js";
import { legalLinks } from "./legal.js";
import { updateCard } from "../update.js";
import { saveShareWorld } from "./feed.js";
import { Sound } from "../sound.js";
import { LANG, setLang } from "../i18n.js";

const VIEWS = [
  { id: "me", label: "Profil" },
  { id: "friends", label: "Amis" },
  { id: "ranking", label: "Classement" },
];

export function profile(view, [sub]) {
  const seg = h("div.seg");
  const body = h("div.mt");
  view.append(seg, body);
  const show = (id) => {
    ls.set("profile_view", id);
    history.replaceState(null, "", "#profile/" + id);
    seg.replaceChildren(...VIEWS.map((v) => h("button" + (v.id === id ? ".on" : ""), { onclick: () => show(v.id) }, v.label)));
    body.replaceChildren();
    if (id === "friends") friends(body);
    else if (id === "ranking") grades(body);
    else me(body, show);
  };
  show(VIEWS.some((v) => v.id === sub) ? sub : ls.get("profile_view", "me"));
}

/** Langue de l'interface (i18n.js) : la page se recharge. Libellés écrits dans leur propre langue (jamais traduits). */
function langRow() {
  const b = (code, label) => h("button" + (LANG === code ? ".on" : ""), { "data-notr": "", onclick: () => { if (LANG !== code) setLang(code); } }, label);
  return h("div.card.pad.mt", h("div.row", h("span.grow", "Langue"), h("div.seg", { "data-notr": "", style: { marginTop: 0 } }, b("fr", "Français"), b("en", "English"))));
}

/** Interrupteur « Sons et vibrations » (sound.js). */
function soundRow() {
  return h("div.card.pad.mt", h("label.switch", h("span.row", { style: { gap: "8px" } }, "Sons et vibrations",
    infoButton("Sons et vibrations", "Bonnes réponses en série (la note monte à chaque bonne réponse), XP, avions attrapés, nouveau grade, avions qui deviennent visibles sur le radar.", { small: true })),
    h("input", { type: "checkbox", checked: Sound.on, onchange: (e) => { Sound.on = e.target.checked; } })));
}

function me(view, show) {
  view.append(updateCard()); // appli Android pas à jour
  const ic = installCard();
  if (ic) view.append(ic);
  if (loginGate(view, "Connecte-toi pour personnaliser ton profil (pseudo, photo) et sauvegarder ta collection.")) {
    view.append(soundRow(), langRow(), legalLinks(), h("p.small.dim", { style: { textAlign: "center" } }, `Plane GO web ${VERSION}`));
    return;
  }
  const avatar = h("img.avatar.lg", { alt: "Ma photo de profil", src: "icons/avatar.svg", style: { cursor: "pointer" }, onclick: changeAvatar });
  avatar.onerror = () => { avatar.src = "icons/avatar.svg"; };
  const name = h("h2", { style: { margin: "10px 0 0" } }), email = h("div.small.dim");
  const level = h("h3", { style: { margin: "14px 0 4px" } }), bar = h("div.xpbar.cyan", h("i")), xpText = h("div.small");
  const stats = h("div.kv.mt");
  // Feed 🌍 Monde : mes publications visibles par tout le monde, ou par mes amis seulement
  const shareInput = h("input", { type: "checkbox", onchange: async () => {
    const want = shareInput.checked;
    shareInput.disabled = true;
    const saved = await saveShareWorld(want);
    shareInput.disabled = false;
    if (saved == null) shareInput.checked = !want; // échec : on remet comme avant
  } });
  const shareRow = h("div.card.pad.mt", { style: { display: "none" } },
    h("label.switch", h("span.row", { style: { gap: "8px" } }, "Mes publications visibles par tout le monde",
      infoButton("Feed Monde", "Dans le feed Monde, tous les joueurs voient et peuvent liker tes publications (même les anciennes). Les commentaires restent entre amis. Décoché : seuls tes amis les voient.", { small: true })), shareInput));
  view.append(h("div", { style: { textAlign: "center" } }, avatar, name, email,
    h("div.row.mt", { style: { justifyContent: "center", flexWrap: "wrap" } },
      h("button.btn.small.outline", { onclick: changeAvatar }, "Changer la photo"), h("button.btn.small.outline", { onclick: editName }, "Modifier le pseudo"))),
    level, bar, xpText, stats, shareRow,
    soundRow(), langRow(),
    h("div.row.mt2", h("button.btn.outline.grow", { onclick: () => show("friends") }, "Mes amis"), h("button.btn.outline.grow", { onclick: () => { ls.set("grades_mode", "grades"); show("ranking"); } }, "Grades")),
    h("button.btn.danger.block.mt2", { onclick: logout }, "Se déconnecter"),
    h("div.row.mt", h("button.btn.small.outline.grow", { onclick: () => go("privacy") }, "Confidentialité"),
      h("button.btn.small.outline.grow", { style: { color: "var(--red)", borderColor: "var(--red)" }, onclick: deleteAccountFlow }, "Supprimer mon compte")),
    legalLinks(), h("p.small.dim", { style: { textAlign: "center" } }, `Plane GO web ${VERSION}`));

  function render() {
    const p = Player.profile, xp = Player.bestXp(), lvl = levelOf(xp);
    if (p?.avatarUrl) avatar.src = p.avatarUrl;
    name.textContent = p?.username || "…"; email.textContent = Supa.email;
    shareRow.style.display = p && p.shareWorld !== undefined ? "" : "none"; // réglage installé sur le serveur ?
    shareInput.checked = !!p?.shareWorld;
    level.textContent = `Niveau ${lvl.number} — ${lvl.title}`;
    bar.firstChild.style.width = (lvl.nextXp ? ((xp - lvl.minXp) / (lvl.nextXp - lvl.minXp)) * 100 : 100) + "%";
    xpText.textContent = lvl.nextXp ? `${xp} XP • encore ${lvl.nextXp - xp} XP pour « ${levelOf(lvl.nextXp).name} »` : `${xp} XP • grade maximum !`;
    const entries = Collection.all();
    const best = entries.reduce((b, e) => (!b || entryRarity(e).ordinal > entryRarity(b).ordinal ? e : b), null);
    const q = QuizStore.stats();
    stats.textContent = [`${entries.length} photo(s)`, `${new Set(entries.map(modelKey).filter(Boolean)).size} modèle(s) différent(s)`,
      `${entries.filter((e) => e.military).length} militaire(s)`, `Quiz : ${q.correct} bonne(s) réponse(s), record ${q.best} d'affilée`,
      best && `Plus belle prise : ${entryModel(best)} (${entryRarity(best).label})`].filter(Boolean).join("\n");
  }

  async function changeAvatar() {
    const file = await pickImage();
    if (!file) return;
    try {
      const blob = await toJpeg(file, 512, 0.85);
      Player.profile = await Cloud.setAvatar(blob);
      render(); renderHud(); toast("Photo de profil mise à jour");
    } catch (e) { toast(e.message || "Impossible de lire cette image"); }
  }
  async function editName() {
    const v = await prompt("Votre pseudo", "3 à 20 caractères : lettres, chiffres, . _ -", Player.profile?.username || "", 20);
    if (v == null) return;
    const n = v.trim();
    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(n)) { toast("Pseudo invalide : 3 à 20 caractères, lettres, chiffres, . _ -"); return; }
    try { Player.profile = await Cloud.setUsername(n); render(); renderHud(); toast("Pseudo mis à jour"); } catch (e) { toast(e.message); }
  }
  async function logout() {
    if (!(await confirmBox("Se déconnecter ? Vos photos restent sauvegardées sur votre compte.", "Se déconnecter", true))) return;
    await Supa.signOut();
  }

  render();
  (async () => { await sync(); try { Player.profile = await Cloud.profile(); } catch { /* hors ligne */ } render(); renderHud(); })();
}

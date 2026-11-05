// Appli Android : prévenir quand une nouvelle version est publiée sur le site. Le numéro de la version publiée
// est écrit dans apk-version.json par la compilation (workflow « Compiler l'appli Android (APK) ») ; l'appli
// installée donne le sien (Native.version()).
import { h, ls, modal } from "./util.js";
import { Native, fromPlayStore } from "./native.js";
import { APK_HOME } from "./config.js";

// APK et numéro de version lus au même endroit (copie GitHub du site) : jamais d'annonce d'une version pas encore en ligne
const APK = APK_HOME + "PlaneGO.apk";
/** « 1.10 » est plus récent que « 1.9 ». */
const newer = (a, b) => {
  const x = String(a).split(".").map((n) => parseInt(n, 10) || 0), y = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
let published = null, fetchedAt = 0;
const RECHECK_MS = 10 * 60e3; // version publiée relue au plus toutes les 10 min

/** { latest, mine } si une version plus récente que celle de l'appli installée est publiée, sinon null. */
export async function appUpdate() {
  // Installée par le Play Store : c'est lui qui la met à jour (Google interdit de proposer un autre téléchargement)
  if (!Native || fromPlayStore()) return null;
  let mine = "";
  try { mine = String(Native.version() || ""); } catch { return null; }
  if (!mine) return null;
  if (Date.now() - fetchedAt > RECHECK_MS) { published = null; fetchedAt = Date.now(); }
  published ||= fetch(APK_HOME + "apk-version.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const v = await published;
  return v?.versionName && newer(v.versionName, mine) ? { latest: v.versionName, mine } : null;
}

/** Télécharge la nouvelle version : dans le navigateur du téléphone (appli 1.7 et plus), sinon lien à copier. */
export function downloadUpdate() {
  if (typeof Native?.openUrl === "function") { try { Native.openUrl(APK); return; } catch { /* ancienne version */ } }
  navigator.clipboard?.writeText(APK).catch(() => {});
  modal({ title: "Télécharger la mise à jour", body: [
    "Ta version de l'appli ne sait pas encore lancer le téléchargement toute seule (la nouvelle le pourra) :",
    "1. Ouvre Chrome (ou ton navigateur habituel).",
    "2. Colle dans la barre d'adresse le lien qui vient d'être copié : davidboccara.github.io/PlaneGO.apk",
    "3. Ouvre le fichier téléchargé puis touche « Mettre à jour ». Ta collection, tes XP et tes réglages sont conservés.",
  ] });
}

/** Au démarrage de l'appli : fenêtre « Nouvelle version », au plus une fois tous les 3 jours pour une même version. */
let checking = false;
export async function checkAppUpdate() {
  if (checking) return; // retour dans l'appli : les deux signaux arrivent en même temps
  checking = true;
  let u = null;
  try { u = await appUpdate(); } finally { checking = false; }
  if (!u) return;
  const last = ls.get("apk_update_asked", {});
  if (last.v === u.latest && Date.now() - last.at < 3 * 86400e3) return;
  ls.set("apk_update_asked", { v: u.latest, at: Date.now() });
  modal({ title: "Nouvelle version de l'appli",
    body: `La version ${u.latest} de Plane GO pour Android est disponible (tu as la ${u.mine}).\nMets-la à jour pour profiter des dernières nouveautés : tes données sont conservées.`,
    buttons: [{ label: "Plus tard" }, { label: "Mettre à jour", primary: true, onClick: () => { setTimeout(downloadUpdate, 50); } }] });
}

/** Carte « Mise à jour disponible » (Profil) ; vide si l'appli est à jour ou dans un navigateur. */
export function updateCard() {
  const box = h("div");
  appUpdate().then((u) => {
    if (!u) return;
    box.replaceChildren(h("div.card.pad", { style: { borderColor: "var(--amber)", marginBottom: "12px" } },
      h("div", { style: { fontWeight: 800, color: "var(--amber)" } }, `Mise à jour disponible : version ${u.latest}`),
      h("div.small", `Tu as la version ${u.mine} de l'appli Android.`),
      h("button.btn.amber.small.mt", { onclick: downloadUpdate }, "Mettre à jour")));
  });
  return box;
}

// L'appli Android reste souvent ouverte en arrière-plan : la page n'est pas rechargée, donc on revérifie
// aussi quand on revient dans l'appli (sinon la nouvelle version n'était proposée qu'au prochain vrai démarrage).
if (Native) {
  window.addEventListener("planego-native-resume", () => setTimeout(checkAppUpdate, 1500));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") setTimeout(checkAppUpdate, 1500); });
}

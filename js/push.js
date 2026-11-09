// Notifications « push » de l'appli Android (1.28+), demandées par le propriétaire le 10/11/2026 : likes et commentaires
// sur mes photos, photos de mes amis, demandes d'ami, concours. Le téléphone a un jeton Firebase (Native.pushToken) que le
// site rattache au compte connecté après chaque synchronisation (RPC push_register, supabase/push.sql) et retire à la
// déconnexion. Le serveur envoie ; l'appli affiche (Push.kt) en ignorant les types décochés dans le Profil
// (Prefs.pushTypes, envoyés avec la configuration de l'appli : nativeConfig de native.js).
import { Native } from "./native.js";
import { Supa } from "./supa.js";
import { LANG } from "./i18n.js";
import { ls } from "./util.js";

/** Types réglables dans le Profil : [clé, libellé]. */
export const PUSH_TYPES = [
  ["likes", "Likes et commentaires sur mes photos"],
  ["posts", "Photos de mes amis"],
  ["friends", "Demandes d'ami"],
  ["contest", "Concours de la semaine"],
];

/** Appli Android qui sait recevoir ces notifications ? (pas dans un navigateur ni avant l'appli 1.28) */
export const pushAvailable = () => typeof Native?.pushToken === "function";

const token = () => { try { return Native.pushToken() || ""; } catch { return ""; } };

/** Rattache le jeton de ce téléphone au compte connecté (une seule fois par compte, jeton et langue). */
export async function registerPush(retry = true) {
  if (!pushAvailable() || !Supa.isLoggedIn) return;
  const tok = token();
  if (!tok) { if (retry) setTimeout(() => registerPush(false), 8000); return; } // 1er lancement : jeton pas encore arrivé
  const key = `${Supa.userId}:${LANG}:${tok}`;
  if (ls.get("push_registered") === key) return;
  try {
    await Supa.rpc("push_register", { p_token: tok, p_lang: LANG });
    ls.set("push_registered", key);
    // Android 13+ : sans autorisation, rien ne s'affiche ; demandée une seule fois ici (le Profil a aussi un bouton)
    if (!ls.get("push_asked") && !Native.canNotify?.()) { ls.set("push_asked", true); Native.askNotifications?.(); }
  } catch { /* hors ligne : nouvel essai à la prochaine synchronisation */ }
}

/** Avant la déconnexion : ce téléphone ne reçoit plus les notifications de ce compte. */
export async function unregisterPush() {
  if (!pushAvailable() || !Supa.isLoggedIn) return;
  ls.del("push_registered");
  const tok = token();
  try { if (tok) await Supa.rpc("push_unregister", { p_token: tok }); } catch { /* hors ligne */ }
}

window.addEventListener("planego-synced", () => registerPush());

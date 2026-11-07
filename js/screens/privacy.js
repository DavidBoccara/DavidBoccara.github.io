// Page « Confidentialité » (#privacy) : quelles données Plane GO garde, pourquoi, où, combien de temps,
// qui les voit (amis, ou tout le monde si le joueur partage ses publications dans le feed Monde),
// et comment tout effacer (bouton « Supprimer mon compte », aussi dans le Profil). Section « Publicité et cookies »
// (Google AdSense) affichée seulement quand la publicité est en service (ads.js).
import { h, modal, toast, confirmBox } from "../util.js";
import { Supa } from "../supa.js";
import { Radar } from "../radar.js";
import { back, go } from "../app.js";
import { CONTACT_EMAIL, LEGAL } from "../config.js";
import { adsOn, adChoices } from "../ads.js";
import { legalLinks } from "./legal.js";

const UPDATED = "7 novembre 2026";

export function privacyPage(view) {
  const sec = (title, ...items) => h("div.card.pad.mt.privacy",
    h("h3", title), ...items.filter(Boolean).map((t) => (t instanceof Node ? t : h("p", t))));
  const list = (...rows) => h("ul", ...rows.filter(Boolean).map((r) => h("li", r)));
  const ads = adsOn();

  view.append(
    h("div.page-head", h("button.back", { onclick: back, "aria-label": "Retour" }, "‹"), h("h1.title.grow", "Confidentialité")),
    h("p.small.dim", `Mise à jour : ${UPDATED}`),
    h("p", "Plane GO est un jeu de spotting d'avions. Voici, simplement, les données que l'appli garde, pourquoi, où, qui peut les voir, et comment tout effacer."),
    h("p", `Responsable de ces données : ${LEGAL.editor}, éditeur de Plane GO (voir les `, h("a", { href: "#legal" }, "Mentions légales"), ")",
      CONTACT_EMAIL ? [", joignable à ", h("a", { href: `mailto:${CONTACT_EMAIL}` }, CONTACT_EMAIL)] : "", "."),

    sec("Sur ton compte (si tu en crées un)",
      list(
        "Ton e-mail et ton mot de passe (chiffré) : uniquement pour te connecter. Les autres joueurs ne les voient jamais.",
        "Ton pseudo, ta photo de profil et ton XP : visibles par les joueurs (recherche d'amis, classement).",
        "Tes captures : tes photos de l'avion (allégées et sans leur position GPS), le modèle, l'immatriculation et le trajet de l'avion, la distance à laquelle il est passé et la date. Visibles par toi et tes amis, et par tous les joueurs seulement si tu choisis de les partager dans le feed Monde (voir plus bas).",
        "Tes likes, commentaires, amis, gains au quiz et résultats du Quiz du jour : visibles par toi et tes amis. Seule exception : sur une publication partagée avec tout le monde, les likes (et qui a liké) sont visibles par tous les joueurs.",
        "Concours de la semaine : la photo que tu proposes est visible par tous les joueurs ; tes votes ne sont visibles que par toi.",
      )),

    sec("Feed Monde : c'est toi qui choisis",
      list(
        "Au départ, tes publications ne sont visibles que par tes amis. L'appli te demande une seule fois si tu veux les partager avec tout le monde.",
        "Si tu dis oui : toutes tes publications, même les anciennes (photo de l'avion, modèle, trajet, date et ton pseudo), apparaissent dans le feed Monde. Tous les joueurs connectés peuvent les voir et les liker.",
        "Les commentaires restent toujours entre amis.",
        "Tu changes d'avis quand tu veux dans ton Profil (« Mes publications visibles par tout le monde ») : décoché, elles redeviennent visibles par tes amis seulement, tout de suite.",
      )),

    sec("Signalements",
      list(
        "Tu peux signaler la publication d'un autre joueur : pas d'avion sur la photo, photo obscène ou choquante, photo qui n'est pas la sienne, ou autre contenu inapproprié.",
        "Les signalements sont anonymes : l'auteur ne sait pas qui l'a signalé. Seul Plane GO les garde, tant que la publication existe.",
        "Quand 5 joueurs différents ont signalé une publication, elle est supprimée pour tout le monde (la photo est effacée du serveur) et ses XP sont retirés à son auteur. L'auteur est prévenu dans l'appli (modèle de l'avion, XP retirés et raison principale).",
      )),

    sec("Seulement sur ton téléphone",
      list(
        "Ta position exacte : elle n'est jamais enregistrée sur le serveur.",
        "La liste des avions passés au-dessus de toi (effacée chaque lundi à 0 h), tes photos en haute définition, tes réglages.",
        "Les photos prises avec la caméra dans l'appli Android : l'original, en pleine qualité, est aussi rangé dans la galerie de ton téléphone (dossier Plane GO). Seule une copie allégée est envoyée sur ton compte.",
        "La vérification de tes photos (date, lieu, photo originale, ciel reconnu par une petite IA) se fait sur ton téléphone : la photo n'est envoyée nulle part pour cela.",
      ),
      "Sans compte, tout reste sur ton téléphone."),

    sec("Ta position",
      "Pour trouver les avions autour de toi, l'appli envoie une position arrondie à environ 1 km aux services publics de données d'avions (adsb.fi, adsb.lol), en passant par notre serveur : ils ne reçoivent ni ton nom, ni ton e-mail, ni ton adresse internet. Avec l'appli Android, le radar écran éteint les interroge directement depuis le téléphone, toujours avec une position arrondie.",
      "Le calcul de la distance et de la direction des avions se fait sur ton téléphone.",
      "Si la position du téléphone n'est pas disponible (localisation refusée, GPS éteint), tu peux indiquer ta ville à la main : le nom tapé est envoyé au service de cartes OpenStreetMap (Nominatim) pour trouver le lieu, et le lieu choisi reste sur ton téléphone."),

    sec("Services utilisés",
      list(
        "Supabase : comptes, base de données et photos, stockés en France, à Paris (serveurs Amazon Web Services « Europe – Paris »).",
        "Cloudflare : hébergement du site plane-go.com (société américaine ; elle voit passer ton adresse internet pour t'envoyer les pages).",
        "GitHub (GitHub Pages) : hébergement de la copie du site davidboccara.github.io (société américaine ; elle voit passer ton adresse internet pour t'envoyer les pages).",
        "adsb.fi et adsb.lol (positions des avions), adsbdb et airport-data.com (fiches des avions ; la photo d'airport-data sert seulement à vérifier que ta photo n'en est pas une copie, elle n'est jamais affichée), Wikipédia et Wikimedia Commons (articles et photos des avions) : ils ne reçoivent que des codes d'avions ou une position arrondie.",
        "OpenAI : écrit les questions bonus du quiz à partir des articles Wikipédia des avions. Il ne reçoit que le texte de l'article, jamais de donnée des joueurs.",
        ads && "Google (régie Google AdSense) : les annonces du feed, voir « Publicité et cookies » ci-dessous.",
      ),
      ads ? "Aucune donnée de ton compte n'est vendue ni transmise aux annonceurs." : "Pas de publicité pour l'instant, pas de traceur, pas de cookie publicitaire, aucune donnée vendue."),

    ads ? sec("Publicité et cookies",
      list(
        "Le feed affiche de temps en temps une annonce fournie par Google (Google Ireland Limited, régie AdSense), marquée « Publicité ». Jamais dans le quiz, le Scanner ou ta collection.",
        "Les annonces ne sont pas personnalisées : Google les choisit d'après le contenu de la page, la langue et la région approximative, pas d'après ton profil. Plane GO ne lui transmet ni ton e-mail, ni ton pseudo, ni tes captures, ni ta position.",
        "Avec ton accord seulement, Google dépose des cookies (ou utilise des identifiants semblables) pour limiter la répétition d'une même annonce, mesurer l'affichage des annonces et lutter contre la fraude. Il reçoit aussi, comme tout site, ton adresse internet et des infos sur ton navigateur.",
        "Ton accord est demandé par le message de Google à ta première visite du feed : « Autoriser » et « Ne pas autoriser » sont au même niveau. Si tu refuses, tu vois quand même des annonces « limitées », sans cookie.",
        "Tu changes d'avis quand tu veux avec « Choix cookies et pub » (bas de cette page, Profil, ou « Pourquoi cette pub ? » sur une annonce).",
        "Si tu as moins de 15 ans, n'accepte les cookies qu'avec l'accord d'un parent ; sinon, choisis « Ne pas autoriser ».",
        "Google peut traiter ces données aux États-Unis, dans le cadre du « Data Privacy Framework » reconnu par l'Union européenne.",
      ),
      h("p", "En savoir plus : ", h("a", { href: "https://policies.google.com/technologies/partner-sites?hl=fr", target: "_blank", rel: "noopener" }, "comment Google utilise les données des sites partenaires"), "."),
      h("button.btn.small.outline", { onclick: adChoices }, "Choix cookies et pub"))
      : sec("Publicité",
        "Plane GO n'affiche pas de publicité pour le moment. Si des annonces arrivent dans le feed, cette page sera mise à jour avant, et ton accord sera demandé pour les cookies publicitaires."),

    sec("Pourquoi Plane GO a le droit d'utiliser ces données",
      list(
        "Ton compte, tes captures, tes amis, le feed et le quiz : pour te fournir le jeu que tu as choisi d'utiliser (les Conditions d'utilisation).",
        "Les signalements, la vérification des photos et la lutte contre la triche : pour garder le jeu honnête et sûr pour tous (intérêt légitime).",
        ads && "Les cookies publicitaires de Google : seulement avec ton accord, que tu peux retirer à tout moment.",
        "Ce que l'appli garde sur ton téléphone (réglages, collection, passages d'avions) sert uniquement à son fonctionnement : ce ne sont pas des traceurs.",
      )),

    sec("Combien de temps",
      list(
        "Ton compte, tes captures et tes photos : jusqu'à ce que tu les supprimes.",
        "Une photo retirée ou supprimée (par toi, ou après 5 signalements) est effacée du serveur.",
        "Tes signalements de publications : tant que la publication signalée existe (ils disparaissent avec elle, ou avec ton compte).",
        "La trace d'une de tes publications retirée après 5 signalements (date, modèle, raison) : un an, pour pouvoir répondre si tu contestes, puis effacée automatiquement.",
        "Les joueurs que tu as bloqués : jusqu'à ce que tu les débloques ou que tu supprimes ton compte.",
        "Ton engagement sur les photos (date et version du texte accepté) : tant que ton compte existe, pour pouvoir le prouver.",
        "Tes signalements de photos ou de questions du quiz : tant que ton compte existe.",
        "Les messages envoyés avec le formulaire de contact (nom, e-mail, message) : un an au plus, puis effacés automatiquement.",
        "Les journaux techniques des hébergeurs (adresse internet, page demandée) : gardés par eux pour la sécurité, selon leurs propres règles.",
        "Les passages d'avions sur ton téléphone : effacés chaque lundi à 0 h.",
      )),

    sec("Tes droits",
      "Tu peux à tout moment modifier ton pseudo et ta photo, choisir si tes publications sont visibles par tout le monde (Profil), supprimer une capture (depuis sa photo), ou supprimer ton compte et toutes tes données avec le bouton ci-dessous : c'est immédiat et définitif.",
      "Tu as aussi le droit de demander une copie de tes données, de les faire corriger, de t'opposer à un usage ou de le faire limiter, et de récupérer tes données dans un format lisible.",
      CONTACT_EMAIL && h("p", "Pour toute question sur tes données : ", h("a", { href: `mailto:${CONTACT_EMAIL}` }, CONTACT_EMAIL), "."),
      "Tu peux aussi adresser une réclamation à la CNIL (cnil.fr)."),

    Supa.isLoggedIn
      ? h("button.btn.danger.block.mt2", { onclick: deleteAccountFlow }, "Supprimer mon compte")
      : h("p.small.dim.mt2", { style: { textAlign: "center" } }, "Tu n'es pas connecté : aucune donnée n'est enregistrée sur le serveur."),
    legalLinks(),
  );
}

/**
 * Suppression définitive du compte : double confirmation (taper SUPPRIMER), fonction serveur delete-account
 * (photos + compte, données en cascade), puis effacement des données de Plane GO sur ce téléphone.
 */
export async function deleteAccountFlow() {
  if (!Supa.isLoggedIn) { go("auth"); return; }
  const ok = await confirmBox([
    "Supprimer définitivement ton compte ?",
    "Tout sera effacé : ton profil, tes photos et captures, tes XP, tes amis, tes likes et commentaires, tes résultats de quiz et ta participation au concours. Les données de Plane GO sur ce téléphone seront aussi effacées.",
    "C'est immédiat, et on ne peut pas revenir en arrière.",
  ], "Continuer", true);
  if (!ok) return;

  const confirmed = await new Promise((resolve) => {
    const input = h("input.input", { maxLength: 12, autocapitalize: "characters", autocomplete: "off", placeholder: "SUPPRIMER" });
    let done = false;
    const m = modal({
      title: "Dernière confirmation",
      body: [h("p", "Tape SUPPRIMER pour effacer ton compte."), input],
      onClose: () => { if (!done) resolve(false); },
      buttons: [
        { label: "Annuler" },
        { label: "Supprimer définitivement", danger: true, onClick: () => {
          if (input.value.trim().toUpperCase() !== "SUPPRIMER") { toast("Tape SUPPRIMER pour confirmer"); return false; }
          done = true; resolve(true);
        } },
      ],
    });
    setTimeout(() => input.focus(), 50);
    m.el.querySelector("input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  });
  if (!confirmed) return;

  const wait = modal({ title: "Suppression…", body: "Effacement de ton compte et de tes photos…", buttons: [] });
  try {
    await Supa.deleteAccount();
  } catch (e) {
    wait.close();
    modal({ title: "Suppression impossible", body: `${e.message}\n\nLa suppression n'a pas pu aller au bout. Réessaie dans un moment.` });
    return;
  }
  await Supa.signOut().catch(() => {});
  await wipeLocal();
  wait.close();
  modal({ title: "Compte supprimé", body: "Ton compte et toutes tes données ont été effacés. Merci d'avoir joué à Plane GO !",
    onClose: () => { location.replace(location.pathname + "#feed"); location.reload(); } });
}

/** Efface les données de Plane GO sur ce téléphone (réglages, collection, passages, quiz, photos). */
async function wipeLocal() {
  try { if (Radar.running) Radar.stop(); } catch { /* ignoré */ }
  try { localStorage.clear(); } catch { /* bloqué */ }
  try { sessionStorage.clear(); } catch { /* bloqué */ }
  await new Promise((res) => {
    try {
      const r = indexedDB.deleteDatabase("planego");
      r.onsuccess = r.onerror = r.onblocked = () => res();
    } catch { res(); }
  });
}

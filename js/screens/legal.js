// Pages légales : « Mentions légales » (#legal, loi LCEN art. 1-1) et « Conditions d'utilisation » (#terms : règles du
// jeu, contenus des joueurs, modération exigée par le règlement européen DSA art. 14, 16 et 17, publicité).
// legalLinks() : rangée de liens vers ces pages, la Confidentialité et le réglage des cookies publicitaires.
import { h } from "../util.js";
import { LANG } from "../i18n.js";
import { back } from "../app.js";
import { CONTACT_EMAIL, LEGAL, SITE_URL, GITHUB_SITE_URL } from "../config.js";
const SITES = `${SITE_URL.replace(/\/$/, "")}, sa copie ${GITHUB_SITE_URL.replace(/\/$/, "")}`;
import { adsOn, legalComplete, adChoices } from "../ads.js";

const UPDATED = "5 novembre 2026";
const sec = (title, ...items) => h("div.card.pad.mt.privacy",
  h("h3", title), ...items.filter(Boolean).map((t) => (t instanceof Node ? t : h("p", t))));
const list = (...rows) => h("ul", ...rows.filter(Boolean).map((r) => h("li", r)));
const mail = () => CONTACT_EMAIL && h("a", { href: `mailto:${CONTACT_EMAIL}` }, CONTACT_EMAIL);
const link = (href, text) => h("a", { href, target: "_blank", rel: "noopener" }, text);
const head = (title) => [
  h("div.page-head", h("button.back", { onclick: back, "aria-label": "Retour" }, "‹"), h("h1.title.grow", title)),
  h("p.small.dim", `Mise à jour : ${UPDATED}`),
];

/** Liens vers les pages légales (bas du Profil, pages légales, création de compte). */
export function legalLinks() {
  return h("div.legal-links",
    h("a", { href: LANG === "en" ? "/en/guides/" : "/guides/" }, "Guides"),
    h("a", { href: LANG === "en" ? "/en/about/" : "/a-propos/" }, "À propos"),
    h("a", { href: LANG === "en" ? "/en/contact/" : "/contact/" }, "Contact"),
    h("a", { href: "#terms" }, "Conditions d'utilisation"),
    h("a", { href: "#privacy" }, "Confidentialité"),
    h("a", { href: "#legal" }, "Mentions légales"),
    adsOn() && h("button", { type: "button", onclick: adChoices }, "Choix cookies et pub"));
}

export function legalPage(view) {
  const pro = legalComplete();
  view.append(...[...head("Mentions légales"),
    sec("Éditeur",
      pro ? h("p", `Plane GO (${SITES} et l'appli Android Plane GO) est édité par ${LEGAL.editor}, ${LEGAL.address}.`)
        : h("p", `Plane GO (${SITES} et l'appli Android Plane GO) est édité à titre non professionnel par ${LEGAL.editor}. Comme le permet la loi (LCEN, article 1-1, II), ses coordonnées personnelles ont été communiquées à l'hébergeur.`),
      pro && list(`Téléphone : ${LEGAL.phone}`, CONTACT_EMAIL && h("span", "E-mail : ", mail()), LEGAL.siren && `SIREN : ${LEGAL.siren}`),
      !pro && CONTACT_EMAIL && h("p", "Contact : ", mail()),
      `Directeur de la publication : ${LEGAL.director || LEGAL.editor}.`),

    sec("Hébergement",
      // Le lieu de stockage d'abord, bien en vue : les adresses étrangères plus bas sont celles des sièges sociaux
      h("div.data-where",
        h("div.dw-label", "Où sont stockées tes données ?"),
        h("div.dw-value", "En France, à Paris"),
        h("p", "Comptes, photos, captures, amis, commentaires, résultats du quiz : toutes les données des joueurs sont stockées sur des serveurs situés à Paris (centre de données Amazon Web Services « Europe – Paris »), et soumises au droit européen (RGPD).")),
      list(
        h("span", h("b", "Données des joueurs : "), "stockées à Paris (France), chez Supabase, Inc. Siège social : 970 Toa Payoh North, #07-04, Singapour 318992 (", link("https://supabase.com", "supabase.com"), ")."),
        h("span", h("b", "Fichiers du site plane-go.com : "), "Cloudflare, Inc., qui envoie les pages du site depuis le serveur le plus proche de toi ; les données des joueurs ne sont pas stockées chez lui. Siège social : 101 Townsend St, San Francisco, CA 94107, États-Unis ; téléphone : +1 650 319 8930 (", link("https://www.cloudflare.com", "cloudflare.com"), ")."),
        h("span", h("b", `Fichiers de la copie ${GITHUB_SITE_URL.replace(/^https:\/\/|\/$/g, "")} : `), "GitHub, Inc. (GitHub Pages), même site et mêmes données que plane-go.com ; les données des joueurs ne sont pas stockées chez lui. Siège social : 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis ; téléphone : +1 415 857 5430 (", link("https://github.com", "github.com"), ")."),
        "Appli Android : distribuée directement par le site plane-go.com.",
      ),
      h("p.small.dim", "Les adresses à Singapour et aux États-Unis sont celles des sièges sociaux de ces entreprises, pas l'endroit où sont rangées tes données.")),

    adsOn() && sec("Publicité",
      "Les annonces du feed sont fournies par Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlande (régie Google AdSense). Chaque annonce porte la mention « Publicité » ; le nom de l'annonceur est indiqué par Google dans l'annonce.",
      "Plane GO ne choisit pas les annonces une par une et n'est pas responsable de leur contenu ni des sites des annonceurs. Une annonce te pose problème ? Signale-la avec l'icône « i » de l'annonce, ou écris-nous."),

    sec("Propriété intellectuelle",
      list(
        "Le nom Plane GO, son logo, sa présentation et son code appartiennent à son éditeur : pas de reproduction sans autorisation.",
        h("span", "Les photos publiées par les joueurs restent la propriété de leurs auteurs (voir les ", h("a", { href: "#terms" }, "Conditions d'utilisation"), ")."),
        "Données et images d'autres sources, propriété de leurs auteurs : positions des avions (adsb.fi, adsb.lol), fiches des appareils (adsbdb), articles et photos de Wikipédia et Wikimedia Commons (licences libres : auteur et licence indiqués sous chaque photo), recherche de lieux (© les contributeurs d'OpenStreetMap, licence ODbL).",
      )),

    sec("Signaler un contenu illicite",
      h("p", "Utilise le bouton « Signaler » (drapeau) d'une publication, ou écris", CONTACT_EMAIL ? [" à ", mail()] : " à l'éditeur", " en indiquant la publication concernée et pourquoi elle te semble illicite. Les règles de modération sont expliquées dans les ", h("a", { href: "#terms" }, "Conditions d'utilisation"), ".")),

    sec("Données personnelles",
      h("p", "Ce que Plane GO garde, pourquoi, et comment tout effacer : voir la page ", h("a", { href: "#privacy" }, "Confidentialité"), ".")),
    legalLinks()].filter(Boolean));
}

export function termsPage(view) {
  const ads = adsOn();
  view.append(...[...head("Conditions d'utilisation"),
    h("p", "En utilisant Plane GO, tu acceptes ces règles. Elles sont écrites simplement : si quelque chose n'est pas clair, demande-nous."),

    sec("1. Plane GO",
      h("p", `Plane GO est un jeu gratuit de spotting d'avions : repérer les avions qui passent au-dessus de toi, les photographier, gagner des XP, jouer au quiz et partager tes photos avec tes amis. Il est édité par ${LEGAL.editor} (voir les `, h("a", { href: "#legal" }, "Mentions légales"), ")."),
      ads ? "Le jeu est gratuit ; des publicités sont affichées dans le feed (voir l'article 7)." : "Le jeu est gratuit."),

    sec("2. Ton compte",
      list(
        "Un compte par personne, avec une adresse e-mail valable. Tu es responsable de ce qui est fait avec ton compte : garde ton mot de passe pour toi.",
        "Si tu as moins de 15 ans, demande l'accord d'un parent avant de créer un compte.",
        "Ton pseudo et ta photo de profil sont visibles par les autres joueurs : pas d'injure, pas de nom de quelqu'un d'autre, rien de choquant.",
        h("span", "Tu peux supprimer ton compte à tout moment (page ", h("a", { href: "#privacy" }, "Confidentialité"), " ou Profil) : tout est effacé."),
      )),

    sec("3. Les règles du jeu",
      list(
        "Publie seulement tes propres photos d'avions, prises par toi. Pas de photo trouvée sur internet ou prise par quelqu'un d'autre.",
        "Rien d'obscène, de violent, de haineux, de discriminatoire ou d'illégal, ni dans les photos, ni dans les commentaires, ni dans le pseudo. Pas de harcèlement.",
        h("span", h("b", "Photos depuis des lieux publics (engagement obligatoire) : "), "tu photographies les avions uniquement depuis des lieux publics où la photo est autorisée (rue, parc, point de vue ou terrasse ouverts au public…). Avoir le droit d'être quelque part ne suffit pas : tu ne prends aucune photo là où c'est interdit (zones militaires ou sensibles, certaines zones d'aéroport, lieux signalés par un panneau ou par les consignes des agents). Tu n'entres jamais sur une propriété privée sans l'accord de son propriétaire, ni sur une piste, derrière une clôture ou sur un terrain interdit. Il faut un compte pour ajouter des photos ; chaque joueur prend cet engagement en créant son compte (ou, pour les joueurs déjà inscrits, à l'ouverture de l'appli ou avant sa prochaine photo) : sans lui, aucune photo ne peut être ajoutée."),
        "Ne photographie pas de personnes reconnaissables sans leur accord.",
        "Sécurité d'abord : ne joue pas en conduisant, respecte les règles des aéroports et des aérodromes et les consignes des agents.",
        "Une photo prise en ne respectant pas cet engagement peut être signalée et supprimée, et le compte suspendu en cas d'abus.",
        "Pas de triche : fausses photos, comptes multiples, contournement des vérifications.",
      )),

    sec("4. Tes photos et tes commentaires",
      list(
        "Tu restes propriétaire de tes photos. En les publiant, tu autorises Plane GO à les afficher gratuitement dans l'appli (à tes amis, à tous les joueurs si tu partages tes publications dans le feed Monde, et dans le concours si tu y participes), tant qu'elles sont en ligne.",
        "Tu garantis que tu as le droit de publier ce que tu publies.",
        "Tu peux retirer une photo ou supprimer une capture quand tu veux.",
      )),

    sec("5. Signalements et modération",
      list(
        "Chaque publication d'un autre joueur peut être signalée (bouton drapeau), avec une raison : pas d'avion sur la photo, contenu obscène ou choquant, photo qui n'est pas la sienne, autre contenu inapproprié. Le signalement est anonyme.",
        "Quand 5 joueurs différents ont signalé une publication, elle est supprimée automatiquement, sans examen par une personne, et ses XP sont retirés. Son auteur est prévenu dans l'appli, avec la raison principale.",
        "Un contenu illicite peut aussi être signalé à l'éditeur (voir les Mentions légales), qui peut le retirer et, en cas d'abus répétés ou graves, suspendre ou supprimer le compte concerné.",
        h("span", "Tu penses qu'une publication t'a été retirée par erreur ? Écris", CONTACT_EMAIL ? [" à ", mail()] : " à l'éditeur", " : ta demande sera examinée par une personne."),
      )),

    sec("6. XP, classement et concours",
      "Les XP, grades, séries et classements servent seulement au jeu : ils n'ont aucune valeur en argent et ne s'échangent pas. Le concours photo de la semaine rapporte des XP au gagnant (la photo qui a reçu le plus de votes), rien d'autre. Les XP obtenus en trichant peuvent être retirés."),

    ads && sec("7. Publicité",
      list(
        "Le feed affiche de temps en temps une annonce de Google (Google AdSense), toujours marquée « Publicité » : une après la 4e publication, puis une toutes les 8. Jamais dans le quiz, le Scanner ou ta collection.",
        "Les annonces ne sont pas personnalisées d'après ton profil. Les cookies de Google ne sont utilisés qu'avec ton accord, que tu peux changer à tout moment (« Choix cookies et pub »).",
        "Plane GO ne vend rien et n'est pas responsable du contenu des annonces ni des sites des annonceurs.",
      )),

    sec(`${ads ? 8 : 7}. Fonctionnement du service`,
      list(
        "Les positions et les infos des avions viennent de sources publiques (adsb.fi, adsb.lol, adsbdb, Wikipédia) : elles peuvent être incomplètes ou fausses. Plane GO est un jeu : ne t'en sers jamais pour la navigation ou la sécurité.",
        "Plane GO est fourni tel quel, sans garantie qu'il marche sans interruption. L'éditeur peut le faire évoluer, ou l'arrêter en prévenant les joueurs.",
      )),

    sec(`${ads ? 9 : 8}. Données personnelles`,
      h("p", "Voir la page ", h("a", { href: "#privacy" }, "Confidentialité"), " : ce que Plane GO garde, pourquoi, où, et comment tout effacer.")),

    sec(`${ads ? 10 : 9}. Changements et droit applicable`,
      "Ces conditions peuvent changer : la date de mise à jour est indiquée en haut de la page, et un changement important est annoncé dans l'appli. Elles sont soumises au droit français.",
      CONTACT_EMAIL && h("p", "Contact : ", mail())),
    legalLinks()].filter(Boolean));
}

// Serveur Supabase (projet « radar-militaire »). La clé « anon » est publique par
// nature : la sécurité repose sur les règles du serveur (supabase/schema.sql).
export const SUPABASE_URL = "https://fuducmhhnrzmprqxfjdh.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1ZHVjbWhobnJ6bXBycXhmamRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMTcxNDMsImV4cCI6MjEwODc5MzE0M30.11UA7PfC_va6bYz8RVDQfplKPx1nVkX04MePhIqSoyU";
/** Version de la partie site (ancien numéro fixe) : la vraie version publiée est lue sur VERSION_URL (worker/index.js). */
export const VERSION = "web";
// Adresse de contact affichée sur les pages « Confidentialité », « Conditions » et « Mentions légales » (vide = ligne masquée).
export const CONTACT_EMAIL = "";

// Mentions légales (loi LCEN, art. 1-1). Avec de la publicité, le site est « professionnel » : l'éditeur doit donner
// son nom, son adresse et son téléphone. Tant que l'adresse ou le téléphone manquent, aucune publicité n'est affichée
// et la page présente le site comme édité à titre non professionnel.
export const LEGAL = {
  editor: "David Boccara",   // éditeur du site (personne responsable)
  director: "David Boccara", // directeur de la publication
  address: "9 rue des Basses Landes, 27150 Puchay", // adresse postale (domicile, ou adresse de domiciliation d'entreprise)
  phone: "+33 6 15 49 92 71",  // numéro de téléphone
  siren: "",                 // numéro SIREN (micro-entreprise), s'il y en a un
};

// Publicité Google AdSense dans le feed. Vide = aucune publicité et aucun script de Google chargé.
// client : identifiant d'éditeur « ca-pub-… » ; slot : numéro du bloc d'annonces ; layoutKey : clé de mise en page
// d'un bloc « In-feed » (vide = bloc d'annonces display ordinaire, adaptatif).
export const ADSENSE = { client: "ca-pub-1156180900899170", slot: "", layoutKey: "" };
// Adresse publique du site : les liens des e-mails (mot de passe oublié, confirmation du compte) y ramènent.
export const SITE_URL = "https://plane-go.com/";
// Copie du site sur GitHub Pages (même code, même base de données) : https://davidboccara.github.io/
export const GITHUB_SITE_URL = "https://davidboccara.github.io/";
/** Vrai sur la copie GitHub Pages (pas de publicité, hébergeur GitHub dans les mentions légales). */
export const onGithubPages = () => /\.github\.io$/i.test(location.hostname);
/** Position approximative du visiteur d'après sa connexion (worker/index.js sur Cloudflare) : sur plane-go.com la même
 *  adresse, ailleurs (copie GitHub, essais en local) celle de plane-go.com. */
export const GEO_URL = /(^|\.)plane-go\.com$/i.test(location.hostname) ? "/__geo" : SITE_URL + "__geo";
/** Version publiée du site (identifiant + date), même principe. */
export const VERSION_URL = GEO_URL.replace("__geo", "__version");
/**
 * Appli Android hors Play Store (fichier .apk) : téléchargée depuis la copie GitHub du site, avec son numéro de version
 * (apk-version.json, lu par update.js). plane-go.com renvoie vers le Play Store.
 */
export const APK_HOME = GITHUB_SITE_URL;

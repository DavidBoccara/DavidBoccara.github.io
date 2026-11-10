// Onglet Feed : trois vues, dans cet ordre — « 🌍 Monde » (ouverte en arrivant sur l'onglet : publications des
// joueurs qui ont choisi de les partager avec tout le monde), « Amis » (captures de mes amis et les miennes, likes,
// commentaires, partage, et résultats du Quiz du jour, qu'on peut liker aussi) et « Concours de la semaine »
// (photo de la semaine, voir contest.js). Chaque publication d'un autre joueur peut être signalée (🚩, report.js).
import { Blocked } from "../blocks.js";
import { linkPlayer } from "./player.js";
import { LOCALE } from "../i18n.js";
import { h, timeAgo, toast, modal, icon, rarityMark, dateDay, gradeTag, rankIcon } from "../util.js";
import { Supa } from "../supa.js";
import { Cloud, sync } from "../cloud.js";
import { Player } from "../store.js";
import { flagOf } from "../game.js";
import { shareCatch, shareOld, installCard, savePhoto, photoName, carousel } from "../ui.js";
import { go, loginGate, renderHud } from "../app.js";
import { contestFeed } from "./contest.js";
import { todayKey } from "./daily.js";
import { Reported, reportButton } from "../report.js";
import { withAds, loadAds } from "../ads.js";
import { playBetaCard } from "../playbeta.js";

const VIEWS = [
  { id: "world", label: "Monde" },
  { id: "friends", label: "Amis" },
  { id: "contest", label: "Concours" },
];

export function feed(view, [sub]) {
  const card = playBetaCard({ dismissible: true }) || installCard({ dismissible: true }); // une seule bannière à la fois
  if (card) view.append(card);
  if (loginGate(view, "Connecte-toi pour voir les avions attrapés par tes amis et par les joueurs du monde entier, liker, commenter et participer à la photo de la semaine.")) return;
  const renamed = (v) => (v === "global" ? "contest" : v); // ancienne adresse #feed/global
  // Depuis la barre d'onglets (#feed sans précision) : toujours le feed 🌍 Monde
  let current = VIEWS.some((v) => v.id === renamed(sub)) ? renamed(sub) : "world", stop = null;
  const seg = h("div.seg.mt.feed-seg");
  const body = h("div.mt");
  view.append(h("div.kicker", "Feed"), h("div.row", h("h1.title.grow", "Les photos des spotters"), h("button.btn.small.outline", { onclick: () => show(current), "aria-label": "Actualiser", title: "Actualiser" }, icon("refresh", 18))), seg, body);

  function show(id) {
    stop?.(); stop = null;
    current = id;
    history.replaceState(null, "", "#feed/" + id);
    seg.replaceChildren(...VIEWS.map((v) => h("button" + (v.id === id ? ".on" : ""), { onclick: () => show(v.id) }, v.label)));
    body.replaceChildren();
    stop = (id === "contest" ? contestFeed(body) : id === "world" ? worldFeed(body) : friendsFeed(body)) || null;
  }
  show(current);
  // Publicité (si elle est en service) : script de Google chargé à l'ouverture du feed, pour que le message de
  // consentement apparaisse ici plutôt qu'au milieu du défilement
  loadAds();
  // Une fois : « Partager tes publications avec tout le monde ? » (puis réglage dans le Profil)
  maybeAskShareWorld().then((changed) => { if (changed && current === "world") show("world"); });
  return () => stop?.();
}

// ---------- Choix « mes publications visibles par tout le monde » ----------

let askedThisLaunch = false;
/** Pose la question une seule fois au joueur (tant qu'il n'a pas répondu) ; true si un choix a été fait. */
async function maybeAskShareWorld() {
  if (askedThisLaunch) return false;
  askedThisLaunch = true;
  const p = await Cloud.profile().catch(() => null);
  if (!p) return false;
  Player.profile = p;
  if (p.shareWorld !== null) return false; // déjà répondu, ou réglage pas encore installé sur le serveur
  return (await askShareWorld()) != null;
}

/** Fenêtre de choix ; renvoie true / false selon la réponse enregistrée, null si fermée sans répondre. */
export function askShareWorld() {
  return new Promise((resolve) => {
    let choice = null;
    modal({
      title: "Partager tes publications avec tout le monde ?",
      body: [
        "Le feed Monde montre les avions attrapés par tous les joueurs qui le souhaitent.",
        h("div.share-box", h("b", "Si tu dis oui"), h("ul",
          h("li", "toutes tes publications, même les anciennes (photo de l'avion, modèle, trajet, date et ton pseudo), sont visibles par tous les joueurs, dans le feed Monde et sur ta page de joueur ;"),
          h("li", "tout le monde peut les liker ;"),
          h("li", "les commentaires restent entre amis."))),
        h("div.share-box", h("b", "Si tu dis non"), h("ul", h("li", "rien ne change : seuls tes amis voient tes publications."))),
        "Tu peux changer d'avis à tout moment dans ton Profil (« Profil public »).",
      ],
      onClose: () => resolve(choice),
      buttons: [
        { label: "Non, mes amis seulement", onClick: async () => { choice = await saveShareWorld(false); } },
        { label: "Oui, avec tout le monde", primary: true, onClick: async () => { choice = await saveShareWorld(true); } },
      ],
    });
  });
}

/** Enregistre le choix ; renvoie le choix, ou null si l'envoi a échoué. */
export async function saveShareWorld(on) {
  try {
    await Cloud.setShareWorld(on);
    if (Player.profile) Player.profile.shareWorld = on;
    toast(on ? "Tes publications sont visibles par tout le monde dans le feed Monde" : "Tes publications restent visibles par tes amis seulement", 4000);
    return on;
  } catch (e) { toast(e.message); return null; }
}

// ---------- Listes de publications ----------

/** Feed des amis : captures et résultats du Quiz du jour, du plus récent au plus ancien. */
function friendsFeed(view) {
  return postList(view, {
    page: (before) => Cloud.feed(before),
    // Résultats du Quiz du jour publiés pendant la même période que cette page de captures
    extra: (before, page, hasMore) => Cloud.dailyResults({ before, since: hasMore ? page.at(-1).createdAt : null }).catch(() => []),
    syncFirst: true,
    empty: () => h("div.empty", "Ton feed est vide.\n\nAttrape ton premier avion ou ajoute des amis pour voir leurs captures ici.",
      h("div.row.mt", { style: { justifyContent: "center" } },
        h("button.btn.outline", { onclick: () => go("profile/friends") }, "Trouver des amis"),
        h("button.btn.primary", { onclick: () => go("scanner") }, "Scanner le ciel"))),
  });
}

/** Feed 🌍 Monde : publications des joueurs qui les partagent avec tout le monde, et où j'en suis de mon partage. */
function worldFeed(view) {
  const mine = h("div");
  view.append(mine);
  let stopList = null;
  const restart = () => { stopList?.(); listBox.replaceChildren(); stopList = list(); };
  function renderMine() {
    const s = Player.profile?.shareWorld;
    if (s === undefined) { mine.replaceChildren(); return; }
    const change = async () => { if ((await askShareWorld()) != null) { renderMine(); restart(); } };
    mine.replaceChildren(s
      ? h("div.world-me", h("span.grow", "Tes publications apparaissent ici, pour tous les joueurs."), h("button.btn.small.outline", { onclick: change }, "Changer"))
      : h("div.world-me", h("span.grow", "Tes publications ne sont visibles que par tes amis."), h("button.btn.small.primary", { onclick: change }, "Les partager ici")));
  }
  const listBox = h("div");
  view.append(listBox);
  const list = () => postList(listBox, {
    page: (before) => Cloud.worldFeed(before),
    empty: () => h("div.empty", "Personne n'a encore partagé de publication avec tout le monde.\n\nPartage les tiennes pour être le premier !"),
    soon: "Le feed Monde arrive très bientôt !",
  });
  renderMine();
  Cloud.profile().then((p) => { if (p) { Player.profile = p; renderMine(); } }).catch(() => {});
  stopList = list();
  return () => stopList?.();
}

/**
 * Liste de publications avec chargement au fil du défilement.
 * page(before) → 30 publications au plus ; extra(before, page, hasMore) → autres éléments à mêler (Quiz du jour).
 */
function postList(view, { page, extra = null, syncFirst = false, empty, soon = null }) {
  const list = h("div.list");
  const more = h("div");
  const emptyBox = h("div", { style: { display: "none" } }, empty());
  view.append(emptyBox, list, more);

  let items = [], cursor = null, loading = false, hasMore = true, adCount = { posts: 0, since: 0 };
  const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) load(false); });
  io.observe(more);

  async function load(reset) {
    if (loading || (!reset && !hasMore)) return;
    loading = true;
    if (reset) list.replaceChildren(h("div.spinner"));
    try {
      if (reset && syncFirst) { await sync(); renderHud(); }
      if (reset) cursor = null;
      const before = reset ? null : cursor;
      const all = await page(before);
      hasMore = all.length >= 30;
      const posts = all.filter((c) => !Reported.has(c.id) && !Blocked.has(c.userId)); // signalées ou joueur bloqué : masquées
      const others = (extra ? await extra(before, all, hasMore) : []).filter((x) => !Blocked.has(x.userId));
      if (all.length) cursor = all.at(-1).createdAt;
      const merged = [...posts, ...others].sort((a, b) => b.createdAt - a.createdAt);
      if (reset) { items = []; list.replaceChildren(); adCount = { posts: 0, since: 0 }; }
      items.push(...merged);
      // Une carte « Publicité » après la 4e publication, puis toutes les 8 (ads.js)
      list.append(...withAds(merged.map((x) => (x.kind === "daily" ? dailyPost(x) : post(x))), adCount));
      emptyBox.style.display = items.length ? "none" : "";
    } catch (e) {
      hasMore = false;
      if (reset) list.replaceChildren();
      // Fonction serveur pas encore installée
      if (soon && e.status === 404) list.replaceChildren(h("div.empty", soon));
      else toast(e.message);
    } finally { loading = false; }
  }

  load(true);
  return () => io.disconnect();
}

/** Bouton ♥ : le compteur change tout de suite, et revient en arrière si l'envoi échoue. */
function likeButton(x, like, unlike) {
  const btn = h("button" + (x.likedByMe ? ".liked" : ""), `${x.likedByMe ? "♥" : "♡"}  ${x.likeCount}`);
  const paint = () => { btn.textContent = `${x.likedByMe ? "♥" : "♡"}  ${x.likeCount}`; btn.classList.toggle("liked", x.likedByMe); };
  btn.onclick = async () => {
    const was = x.likedByMe;
    x.likedByMe = !was; x.likeCount += was ? -1 : 1; paint();
    try { await (was ? unlike(x.id) : like(x.id)); }
    catch (e) { x.likedByMe = was; x.likeCount += was ? 1 : -1; paint(); toast(e.message); }
  };
  return btn;
}

// Joueurs « Légende du ciel » (grade maximum) bien visibles dans le feed : carte bordée d'ambre, bandeau avec l'étoile ailée
const isLegend = (u) => !!u?.level && !u.level.nextXp;
const legendBand = (u) => isLegend(u) && h("div.legend-band", rankIcon(8, 14), h("span", "Légende du ciel"));

const avatar = (u) => { const av = h("img.avatar.sm", { alt: "", src: u?.avatarUrl || "icons/avatar.svg" }); av.onerror = () => { av.src = "icons/avatar.svg"; }; return av; };

/** Résultat du Quiz du jour d'un ami (ou le mien). */
function dailyPost(r) {
  const mine = r.userId === Supa.userId, perfect = r.total >= 3 && r.correct === r.total;
  const emoji = perfect ? "" : r.correct * 2 >= r.total ? "" : "";
  const dayText = r.day === todayKey() ? "d'aujourd'hui"
    : "du " + new Date(r.day + "T12:00:00").toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
  return h("div.card.post.daily-post" + (isLegend(r.user) ? ".legend" : ""), { "data-author": r.userId || "" }, legendBand(r.user),
    h("div.head", linkPlayer(avatar(r.user), r.userId), h("div.grow",
      h("div", linkPlayer(h("b", r.user?.username || "Un spotter"), r.userId), gradeTag(r.user?.level, r.user?.beta), " a fait le ", h("b", "Quiz du jour")),
      h("div.small.dim", h("span", timeAgo(r.createdAt)), r.user && [" · ", h("span", r.user.level.name)]))),
    h("div.daily-score", h("div.big", `${emoji} ${r.correct}/${r.total}`),
      h("div.small", `bonne${r.correct > 1 ? "s" : ""} réponse${r.correct > 1 ? "s" : ""} au quiz ${dayText}`)),
    h("div.xpbar", h("i", { style: { width: `${r.total ? (r.correct / r.total) * 100 : 0}%` } })),
    h("div.tags", perfect && h("span.tag", "Sans faute"),
      h("span.chip.small", r.points > 0 ? `+${r.points} XP` : "0 XP")),
    h("div.acts", likeButton(r, Cloud.likeDaily, Cloud.unlikeDaily),
      !mine && h("button", { onclick: () => go("quiz/daily") }, "Faire le mien")));
}

/** Capture (la mienne, celle d'un ami, ou celle d'un joueur qui la partage avec tout le monde). */
function post(c) {
  const color = c.rarity.color;
  const likeBtn = likeButton(c, Cloud.like, Cloud.unlike);
  // Page de la publication : photo du joueur, fiche de l'avion et commentaires
  const open = () => { sessionStorage.setItem("catch_" + c.id, JSON.stringify({ ...c, user: c.user && { id: c.user.id, username: c.user.username, avatarPath: c.user.avatarPath, xp: c.user.xp, models: c.user.models,
      likesReceived: c.user.likesReceived, gradeFloor: c.user.gradeFloor, beta: c.user.beta },
    photo: c.photoUrl, photos: c.photoUrls, index: car?.index() || 0 })); go("comments/" + c.id); };
  // Photos de l'avion : une seule, ou l'album en carrousel (on fait glisser, comme sur Instagram)
  const urls = c.photoUrls?.length ? c.photoUrls : [c.photoUrl];
  const car = carousel(urls, { onTap: open });
  const current = () => urls[car.index()] || c.photoUrl;
  // Avatar et pseudo : page du joueur (ses photos, si son profil est public ou si c'est un ami)
  const av = linkPlayer(avatar(c.user), c.userId);
  const who = () => [linkPlayer(h("b", c.user?.username || "Un spotter"), c.userId), gradeTag(c.user?.level, c.user?.beta)]; // pseudo + insigne de grade (+ bêta-testeur)
  let card = null;
  // signalée : la publication disparaît de mon feed ; joueur bloqué : toutes ses publications affichées aussi
  const flag = reportButton(c, (r) => r?.blocked ? document.querySelectorAll(`[data-author="${c.userId}"]`).forEach((x) => x.remove()) : card?.remove());
  const details = [c.countryName && `${flagOf(c.countryIso)} ${c.countryName}`, c.operator, c.route && `${c.route}`,
    c.flightKm != null && `${Math.round(c.flightKm).toLocaleString(LOCALE)} km parcourus`, c.source === "import" && "photo ajoutée après coup"].filter(Boolean).join(" • ");
  // Photo ancienne (ajoutée depuis le Catalogue) : compte comme attrapé dans la collection, mais sans XP ; date de la photo
  const old = c.source === "old";
  card = h("div.card.post" + (isLegend(c.user) ? ".legend" : ""), { "data-author": c.userId || "" }, legendBand(c.user),
    h("div.head", av, h("div.grow",
      old ? h("div", who(), " a partagé une photo ancienne : ", h("b", c.modelName || "un avion"), c.military ? " (militaire)" : "")
        : h("div", who(), c.modelName ? [" a attrapé un ", h("b", c.modelName)] : [" a attrapé ", h("b", "un avion")], c.military ? " (militaire)" : ""),
      h("div.small.dim", h("span", old ? `photo du ${dateDay(c.takenAt)}` : timeAgo(c.takenAt)), c.user && [" · ", h("span", c.user.level.name)])), flag),
    car,
    h("div.tags", rarityMark(c.rarity), old ? h("span.chip.small.old-chip", "Photo ancienne") : h("span.chip.small", c.xp > 0 ? `+${c.xp} XP` : "0 XP")),
    details && h("div.det", details),
    // Commentaires réservés aux amis : pas de compteur sur la publication d'un joueur qui n'est pas mon ami
    h("div.acts", likeBtn, h("button", { onclick: open, "aria-label": "Commentaires" }, icon("comment", 18), c.isFriend ? ` ${c.commentCount}` : ""),
      h("button", { onclick: () => old ? shareOld(c.modelName, current(), c.userId === Supa.userId ? null : c.user?.username || "")
        : shareCatch({ mine: c.userId === Supa.userId, player: c.user?.username, model: c.modelName,
        rarity: c.rarity, xp: c.xp, route: c.route, military: c.military }, current()) }, icon("share", 18), " Partager"),
      h("button", { onclick: () => savePhoto(current(), photoName(c.modelName, c.takenAt)), "aria-label": "Enregistrer la photo sur le téléphone", title: "Enregistrer la photo" }, icon("download", 18))));
  return card;
}

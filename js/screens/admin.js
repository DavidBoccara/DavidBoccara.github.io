// Console d'administration (Profil › Admin), réservée aux administrateurs : table private.admins de la base
// (pour l'instant le joueur Toshley). L'écran ne fait qu'afficher : chaque lecture et chaque action est vérifiée par le
// serveur (fonctions admin_* de supabase/admin.sql ; suppressions par la fonction serveur « admin »).
// Vues : Résumé (chiffres, appels aux services), Serveur (place prise, mémoire vive, processeur, disque), Audience (Google Analytics), Joueurs (fiche, XP, pseudo, photo, suspension, suppression du compte),
// Signalements (publications, photos du quiz, questions de l'IA, publications retirées), Publications (photos et
// commentaires de tous les joueurs, profils privés compris) et Messages (formulaire de contact).
// En français seulement : data-notr (jamais traduit), fichier ignoré par tools/i18n_check.py.
import { h, toast, modal, confirmBox, choose, prompt, icon, infoButton, dateTime, timeAgo } from "../util.js";
import { LOCALE } from "../i18n.js";
import { Supa } from "../supa.js";
import { Admin, MyStatus } from "../cloud.js";
import { levelOf, prettyModel } from "../game.js";
import { carousel } from "../ui.js";
import { REASONS } from "../report.js";
import { go } from "../app.js";
import { Badges } from "../badges.js";

const VIEWS = [
  { id: "summary", label: "Résumé" },
  { id: "players", label: "Joueurs" },
  { id: "reports", label: "Signalements" },
  { id: "posts", label: "Publications" },
  { id: "messages", label: "Messages" },
  { id: "server", label: "Serveur" },
  { id: "audience", label: "Audience" },
];

// ---------- Petits outils ----------
const num = (n) => Number(n || 0).toLocaleString(LOCALE);
const when = (ts) => (ts ? dateTime(Date.parse(ts)) : "—");
const ago = (ts) => (ts ? timeAgo(Date.parse(ts)) : "jamais");
const photoUrl = (p) => (p ? Supa.publicUrl("photos", p) : "");
const modelOf = (o) => prettyModel(o.model || o.type) || "Avion";
const plural = (n, one, many) => `${num(n)} ${Number(n) > 1 ? many : one}`;
const reasonLabel = (id) => REASONS.find((r) => r.id === id)?.label || id;
const spinner = () => h("div.spinner");
/** replaceChildren sans les éléments absents (null, false), qui s'afficheraient sinon en texte « null ». */
const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false && k !== ""));

function avatar(path, cls = "img.avatar.sm") {
  const im = h(cls, { alt: "", src: path ? Supa.publicUrl("avatars", path) : "icons/avatar.svg" });
  im.onerror = () => { im.src = "icons/avatar.svg"; };
  return im;
}
const stat = (k, v, hot = false, onclick = null) =>
  h("div.fly-stat" + (hot ? ".hot" : "") + (onclick ? ".link" : ""), { onclick }, h("span.k", k), h("span.v", String(v)));
const stats = (cells, cols = 3) => h("div.fly-stats.adm-stats", { style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } }, cells);
const chip = (text, kind = "") => h("span.adm-chip" + (kind ? "." + kind : ""), text);

/** Fenêtre de la console (jamais traduite). */
function amodal(opts) {
  const m = modal({ wide: true, buttons: [{ label: "Fermer" }], ...opts });
  m.el.parentElement?.setAttribute("data-notr", "");
  return m;
}

/** Bouton qui se bloque pendant l'action et affiche l'erreur éventuelle. */
function actBtn(cls, label, fn) {
  const b = h("button.btn.small" + cls, label);
  b.onclick = async (e) => {
    e.stopPropagation();
    b.disabled = true;
    try { await fn(); } catch (err) { toast(err.message || "Erreur"); }
    b.disabled = false;
  };
  return b;
}

/** Pseudo cliquable : fiche du joueur. */
function userLink(id, name, onChange) {
  if (!id) return h("span", name || "?");
  return h("b.player-link", { onclick: (e) => { e.stopPropagation(); openPlayer(id, onChange); } }, name || "?");
}

/** Miniature d'une photo de publication, toucher = la publication en grand. */
function thumb(path, catchId, onChange) {
  const im = h("img.adm-thumb", { alt: "", loading: "lazy", src: photoUrl(path) });
  im.onclick = (e) => { e.stopPropagation(); openPost(catchId, onChange); };
  return im;
}

// ---------- Écran ----------
/** view : où afficher ; sub : vue demandée ; onRoute(vue) : met l'adresse à jour (#profile/admin/<vue>). */
export function adminConsole(view, sub, onRoute = () => {}) {
  const root = h("div.admin", { "data-notr": "" });
  view.append(root);
  if (!MyStatus.admin) { root.append(h("div.card.pad.mt", "Réservé à l'administrateur.")); return null; }
  const seg = h("div.seg.admin-seg");
  const body = h("div.mt");
  root.append(seg, body);
  let current = null, alive = true;
  // Pastilles : signalements à traiter, messages pas encore vus (mêmes chiffres que l'onglet Profil, badges.js)
  const counts = { reports: () => Badges.reports, messages: () => Badges.messages };
  const paint = () => seg.replaceChildren(...VIEWS.map((v) => h("button" + (v.id === current ? ".on" : ""), { onclick: () => show(v.id) },
    v.label, counts[v.id]?.() ? h("span.adm-count", String(counts[v.id]())) : null)));
  const refreshCounts = () => Badges.refresh();
  window.addEventListener("planego-badges", paint);
  function show(id, opts = {}) {
    current = id;
    onRoute(id);
    paint();
    body.replaceChildren();
    const ctx = { show, changed: refreshCounts, ...opts };
    ({ summary, players, reports, posts, messages, server, audience })[id](body, ctx);
  }
  // « Ses publications » / « Ses commentaires » depuis la fiche d'un joueur
  const onPosts = (e) => show("posts", e.detail || {});
  window.addEventListener("planego-admin-posts", onPosts);
  refreshCounts();
  show(VIEWS.some((v) => v.id === sub) ? sub : "summary");
  return () => { alive = false; window.removeEventListener("planego-admin-posts", onPosts); window.removeEventListener("planego-badges", paint); };
}

// ---------- Résumé ----------
const SERVICES = [
  ["relais", "Relais ADS-B (serveur)"],
  ["relais:adsb.fi", "dont réponses adsb.fi", true],
  ["relais:adsb.lol", "dont réponses adsb.lol", true],
  ["adsb.fi:429", "refus « trop de demandes » d'adsb.fi", true],
  ["adsb.lol:429", "refus « trop de demandes » d'adsb.lol", true],
  ["relais:echec", "aucune source n'a répondu", true],
  ["site:telephone", "Téléphones Android (appli 1.27+)"],
  ["site:adsbdb", "adsbdb (fiches, trajets)"],
  ["site:wikipedia", "Wikipédia"],
  ["site:wikidata", "Wikidata"],
  ["site:commons", "Wikimedia Commons (photos)"],
  ["site:nominatim", "OpenStreetMap (lieux)"],
  ["site:ia", "Questions de l'IA"],
  ["site:fonctions", "Autres fonctions Supabase"],
  ["site:base", "Base Supabase"],
  ["site:stockage", "Stockage Supabase"],
];
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = (msAgo = 0) => dayFmt.format(new Date(Date.now() - msAgo));

async function summary(body, { show }) {
  body.append(spinner());
  let o, usage;
  try { [o, usage] = await Promise.all([Admin.overview(), Admin.apiUsage(31).catch(() => [])]); }
  catch (e) { fill(body, h("div.card.pad", e.message)); return; }
  const go2 = (id) => () => show(id);
  fill(body, 
    h("div.row", h("div.section.grow", "Joueurs"), h("button.btn.small.outline", { onclick: () => show("summary"), title: "Actualiser" }, icon("refresh", 16))),
    stats([stat("Joueurs", num(o.players), false, go2("players")), stat("Nouveaux 7 j", num(o.players_7d)), stat("Actifs 24 h", num(o.active_24h)),
      stat("Actifs 7 j", num(o.active_7d)), stat("Profils publics", num(o.public_profiles)), stat("Suspendus", num(o.suspended), o.suspended > 0)]),
    h("div.section", "À traiter"),
    stats([stat("Publications signalées", num(o.reports_open), o.reports_open > 0, go2("reports")),
      stat("Photos du quiz", num(o.quiz_flags), o.quiz_flags > 0, go2("reports")),
      stat("Questions IA", num(o.ai_flags), o.ai_flags > 0, go2("reports")),
      stat("Messages", num(o.messages), o.messages_7d > 0, go2("messages")),
      stat("Retirées 30 j", num(o.removals_30d)), stat("Avions inconnus", num(o.unknown_types))]),
    h("div.section", "Publications"),
    stats([stat("Total", num(o.catches), false, go2("posts")), stat("24 h", num(o.catches_24h)), stat("7 jours", num(o.catches_7d)),
      stat("Anciennes", num(o.old_photos)), stat("Commentaires 7 j", num(o.comments_7d)), stat("XP quiz 24 h", num(o.quiz_xp_24h))]),
    apiBlock(usage, o));
}

function apiBlock(rows, o) {
  const today = dayKey(), yesterday = dayKey(86400e3), week = dayKey(6 * 86400e3), month = today.slice(0, 7);
  const sum = (svc, test) => rows.filter((r) => r.service === svc && test(r.day)).reduce((a, r) => a + Number(r.calls), 0);
  const known = new Set(SERVICES.map((s) => s[0]));
  const extra = [...new Set(rows.map((r) => r.service))].filter((s) => !known.has(s)).map((s) => [s, s, true]);
  const lines = [...SERVICES, ...extra].filter(([svc, , sub]) => !sub || rows.some((r) => r.service === svc));
  const table = h("table.adm-table",
    h("thead", h("tr", h("th", "Service"), h("th", "Auj."), h("th", "Hier"), h("th", "7 j"), h("th", "30 j"))),
    h("tbody", lines.map(([svc, label, sub]) => h("tr" + (sub ? ".sub" : ""), h("td", label),
      ...[(d) => d === today, (d) => d === yesterday, (d) => d >= week, () => true].map((t) => h("td.v", num(sum(svc, t))))))));
  // Relais par jour (14 derniers jours)
  const days = Array.from({ length: 14 }, (_, i) => dayKey((13 - i) * 86400e3));
  const per = days.map((d) => sum("relais", (x) => x === d) + sum("site:telephone", (x) => x === d));
  const max = Math.max(1, ...per);
  const bars = h("div.adm-bars", days.map((d, i) => h("div.b", { title: `${d} : ${num(per[i])}` },
    h("i", { style: { height: `${Math.round((per[i] / max) * 100)}%` } }), h("span", d.slice(8)))));
  const fnMonth = sum("relais", (d) => d.startsWith(month)) + sum("site:ia", (d) => d.startsWith(month)) + sum("site:fonctions", (d) => d.startsWith(month));
  const first = rows.length ? rows.map((r) => r.day).sort()[0] : null;
  return h("div",
    h("div.row", h("div.section.grow", "Appels aux services"), infoButton("Appels aux services", [
      "Relais ADS-B : compté exactement par le serveur, à chaque demande d'avions venue d'un navigateur (ordinateur, iPhone) ou d'une appli Android 1.26 ou plus ancienne. Les lignes « dont » disent quelle source a répondu, et combien de fois adsb.fi ou adsb.lol ont refusé (trop de demandes).",
      "Téléphones Android : demandes d'avions faites par l'appli 1.27+ elle-même, quand l'appli est ouverte. Le radar qui tourne écran éteint interroge adsb.fi directement et n'est pas compté.",
      "Les autres lignes sont comptées par chaque téléphone ou navigateur, puis envoyées toutes les 10 minutes et à la fermeture de l'appli (des nombres seulement). Un joueur hors ligne envoie ses chiffres plus tard ; les images affichées ne sont pas comptées.",
      `Plan gratuit Supabase : 500 000 appels de fonctions par mois (relais, IA, signalements…), 5 Go de bande passante. Ce mois-ci : ${num(fnMonth)} appels de fonctions comptés.`,
      `${num(o.ai_articles)} articles Wikipédia ont déjà leurs questions écrites par l'IA (${num(o.ai_articles_7d)} ces 7 derniers jours) : un article n'est envoyé à l'IA qu'une fois.`,
    ], { small: true })),
    rows.length ? table : h("div.small.dim", "Pas encore de chiffres : le comptage vient de commencer."),
    h("div.small.dim.mt", "Demandes d'avions par jour (relais + téléphones), 14 derniers jours"),
    bars,
    h("div.small.dim.mt", `Fonctions Supabase ce mois-ci : ${num(fnMonth)} / 500 000 (plan gratuit)` + (first ? ` · chiffres depuis le ${new Date(first + "T12:00:00").toLocaleDateString(LOCALE)}` : "")));
}

// ---------- Joueurs ----------
const SORTS = [["recent", "Inscription"], ["seen", "Vus récemment"], ["xp", "XP"], ["reported", "Signalés"]];

function players(body, ctx) {
  const q = h("input.input", { type: "search", placeholder: "Pseudo, e-mail ou identifiant", autocomplete: "off" });
  const sortSeg = h("div.seg.adm-sub");
  const list = h("div.list.mt");
  const more = h("button.btn.outline.block.mt", { style: { display: "none" } }, "Afficher plus");
  let sort = "recent", offset = 0, timer = 0, token = 0;
  const paintSort = () => sortSeg.replaceChildren(...SORTS.map(([id, label]) =>
    h("button" + (id === sort ? ".on" : ""), { onclick: () => { sort = id; paintSort(); load(true); } }, label)));
  async function load(reset) {
    const my = ++token;
    if (reset) { offset = 0; list.replaceChildren(spinner()); }
    more.disabled = true;
    try {
      const rows = await Admin.players(q.value.trim(), sort, offset);
      if (my !== token) return;
      if (reset) list.replaceChildren();
      list.append(...rows.map((p) => playerRow(p, () => { load(true); ctx.changed(); })));
      if (!list.children.length) list.append(h("div.dim", "Aucun joueur trouvé."));
      offset += rows.length;
      more.style.display = rows.length >= 50 ? "" : "none";
    } catch (e) { if (reset) list.replaceChildren(); toast(e.message); }
    more.disabled = false;
  }
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => load(true), 350); };
  more.onclick = () => load(false);
  body.append(q, sortSeg, list, more);
  paintSort();
  load(true);
}

function playerRow(p, onChange) {
  const lvl = levelOf(p.xp);
  return h("div.card.adm-row", { onclick: () => openPlayer(p.id, onChange) },
    avatar(p.avatar_path),
    h("div.grow",
      h("div.adm-name", p.username, p.admin && chip("Admin", "acc"), p.suspended && chip("Suspendu", "warn"),
        p.share_world && chip("Public"), p.reports > 0 && chip(plural(p.reports, "signalement", "signalements"), "warn")),
      h("div.small.dim", `${num(p.xp)} XP · Niv. ${lvl.number} · ${plural(p.catches, "publication", "publications")}`),
      h("div.small.dim", `Inscrit le ${new Date(p.created_at).toLocaleDateString(LOCALE)} · vu ${ago(p.last_seen)}`)),
    h("span.adm-chev", "›"));
}

/** Fiche d'un joueur : informations, XP, modération. onChange() après une modification. */
export function openPlayer(id, onChange = () => {}) {
  const box = h("div", spinner());
  const m = amodal({ title: "Joueur", body: box });
  const changed = () => { render(); onChange(); };
  async function render() {
    let p;
    try { p = await Admin.player(id); } catch (e) { fill(box, h("p", e.message)); return; }
    if (!p) { fill(box, h("p", "Joueur introuvable (compte supprimé ?).")); return; }
    const lvl = levelOf(p.xp);
    const line = (k, ...v) => [h("span.k", k), h("span", ...v)];
    const mail = p.email ? [h("a", { href: `mailto:${p.email}`, target: "_blank", rel: "noopener" }, p.email),
      h("button.btn.small.outline.adm-copy", { onclick: () => copy(p.email) }, "Copier"), p.email_confirmed ? null : " (pas confirmé)"] : ["—"];
    const susp = p.suspension;
    const actions = h("div.adm-actions",
      actBtn(".primary", "Modifier les XP", () => editXp(p, changed)),
      actBtn(".outline", "Renommer", async () => {
        const name = await prompt(`Renommer ${p.username}`, "Nouveau pseudo (3 à 20 caractères).", p.username, 20);
        if (name == null || !name.trim() || name.trim() === p.username) return;
        await Admin.rename(p.id, name.trim());
        toast(`Pseudo changé : ${name.trim()}`);
        changed();
      }),
      p.avatar_path && actBtn(".outline", "Retirer la photo de profil", async () => {
        if (!(await confirmBox(`Retirer la photo de profil de ${p.username} ? Elle est effacée du serveur.`, "Retirer", true))) return;
        await Admin.clearAvatar(p.id);
        toast("Photo de profil retirée");
        changed();
      }),
      !p.admin && (susp
        ? actBtn(".outline", "Lever la suspension", async () => {
          if (!(await confirmBox(`Lever la suspension de ${p.username} ?`, "Lever"))) return;
          await Admin.unsuspend(p.id);
          toast("Suspension levée");
          changed();
        })
        : actBtn(".outline", "Suspendre", () => suspendFlow(p, changed))),
      actBtn(".outline", "Ses publications", async () => { m.close(); showPosts({ userId: p.id, username: p.username }); }),
      actBtn(".outline", "Ses commentaires", async () => { m.close(); showPosts({ userId: p.id, username: p.username, tab: "comments" }); }),
      actBtn(".outline", "Sa page de joueur", async () => { m.close(); go("player/" + p.id); }),
      !p.admin && actBtn(".danger", "Supprimer le compte", async () => {
        const typed = await prompt(`Supprimer le compte de ${p.username} ?`,
          `Tout sera effacé définitivement : profil, photos, XP, amis, commentaires. Tape le pseudo ${p.username} pour confirmer.`, "", 20);
        if (typed == null) return;
        if (typed.trim() !== p.username) { toast("Pseudo différent : rien n'a été supprimé"); return; }
        await Admin.deleteAccount(p.id);
        toast(`Compte de ${p.username} supprimé`);
        m.close();
        onChange();
      }));
    fill(box, 
      h("div.row", { style: { gap: "12px", alignItems: "center" } }, avatar(p.avatar_path, "img.avatar.lg"),
        h("div.grow", { style: { minWidth: 0 } }, h("div.player-name", p.username),
          h("div.small.dim", `Niv. ${lvl.number} · ${lvl.name}`),
          h("div.adm-name", { style: { marginTop: "4px" } }, p.admin && chip("Admin", "acc"), susp && chip("Suspendu", "warn"),
            chip(p.share_world ? "Profil public" : p.share_world === false ? "Profil privé" : "Profil : pas choisi")))),
      susp && h("div.card.pad.mt.adm-warn", h("b", susp.until ? `Suspendu jusqu'au ${when(susp.until)}` : "Suspendu sans date de fin"),
        h("div.small", susp.reason ? `Motif : ${susp.reason}` : "Pas de motif noté"), h("div.small.dim", `Depuis le ${when(susp.created_at)}`)),
      h("div.adm-info",
        ...line("E-mail", ...mail),
        ...line("Inscription", when(p.created_at)),
        ...line("Dernière visite", `${when(p.last_seen)} (${ago(p.last_seen)})`),
        ...line("Engagement photo", p.photo_rules ? `pris (version ${p.photo_rules})` : "pas encore pris"),
        ...line("Identifiant", h("code", p.id))),
      h("div.section", "XP"),
      stats([stat("Total", num(p.xp), true), stat("Captures", num(p.xp_catches)), stat("Quiz", num(p.xp_quiz)), stat("Bonus", num(p.xp_grants))], 4),
      p.xp_quiz_24h > 300 && h("div.small.adm-warn-text", `Attention : ${num(p.xp_quiz_24h)} XP de quiz ces dernières 24 heures.`),
      h("div.section", "Activité"),
      stats([stat("Publications", num(p.catches)), stat("Modèles", num(p.models)), stat("Anciennes", num(p.old_photos)),
        stat("Commentaires", num(p.comments)), stat("Likes donnés", num(p.likes)), stat("Amis", num(p.friends))]),
      h("div.section", "Modération"),
      stats([stat("Signalements reçus", num(p.reports_received), p.reports_received > 0), stat("Signalements faits", num(p.reports_made)),
        stat("Retraits", num(p.removals), p.removals > 0), stat("Bloqué par", num(p.blocked_by), p.blocked_by > 0),
        stat("Quiz du jour", num(p.daily)), stat("XP quiz 24 h", num(p.xp_quiz_24h), p.xp_quiz_24h > 300)]),
      actions,
      p.grants?.length ? h("div", h("div.section", "Derniers ajustements d'XP"), h("div.list", p.grants.map((g) =>
        h("div.adm-grant", h("b", { style: { color: g.points > 0 ? "var(--green)" : "var(--red)" } }, (g.points > 0 ? "+" : "") + num(g.points)),
          h("span.grow", g.reason || ""), h("span.small.dim", when(g.created_at)))))) : null);
  }
  // Ouvre la vue Publications de la console filtrée sur ce joueur
  function showPosts(opts) { window.dispatchEvent(new CustomEvent("planego-admin-posts", { detail: opts })); }
  render();
}

function copy(text) {
  navigator.clipboard?.writeText(text).then(() => toast("Copié"), () => toast(text, 6000));
}

/** XP d'un joueur : ajouter, retirer ou fixer le total (ligne « bonus » de xp_grants, motif noté). */
function editXp(p, onDone) {
  let mode = "add";
  const modes = [["add", "Ajouter"], ["sub", "Retirer"], ["set", "Fixer le total"]];
  const seg = h("div.seg.adm-sub");
  const amount = h("input.input", { type: "number", min: 0, step: 1, inputMode: "numeric", placeholder: "Nombre d'XP" });
  const reason = h("input.input.mt", { maxLength: 200, placeholder: "Motif (gardé dans la fiche du joueur)" });
  const preview = h("div.small.dim.mt");
  const paint = () => {
    seg.replaceChildren(...modes.map(([id, label]) => h("button" + (id === mode ? ".on" : ""), { onclick: () => { mode = id; paint(); } }, label)));
    const n = Math.round(Number(amount.value) || 0);
    preview.textContent = mode === "set" ? `${p.username} : ${num(p.xp)} → ${num(n)} XP`
      : `${p.username} : ${num(p.xp)} → ${num(Math.max(0, p.xp + (mode === "sub" ? -n : n)))} XP`;
  };
  amount.oninput = paint;
  const m = amodal({
    title: "Modifier les XP", wide: false,
    body: [h("div.small.dim", `Actuellement ${num(p.xp)} XP (captures ${num(p.xp_catches)}, quiz ${num(p.xp_quiz)}, bonus ${num(p.xp_grants)}).`),
      seg, amount, reason, preview],
    buttons: [{ label: "Annuler" }, { label: "Enregistrer", primary: true, onClick: async () => {
      const n = Math.round(Number(amount.value));
      if (!Number.isFinite(n) || n < 0 || (mode !== "set" && n === 0)) { toast("Indique un nombre d'XP"); return false; }
      try {
        const r = await Admin.setXp(p.id, mode === "sub" ? -n : n, mode === "set" ? "set" : "add", reason.value.trim());
        toast(`${p.username} : ${num(r?.xp)} XP`);
        onDone();
      } catch (e) { toast(e.message); return false; }
    } }],
  });
  paint();
  setTimeout(() => amount.focus(), 50);
  return m;
}

/** Suspension : durée + motif (le joueur voit le motif dans son Profil). */
async function suspendFlow(p, onDone) {
  const durations = [[1, "1 jour"], [3, "3 jours"], [7, "7 jours"], [30, "30 jours"], [0, "Sans date de fin"]];
  const i = await choose(`Suspendre ${p.username} pendant…`, durations.map((d) => d[1]));
  if (i < 0) return;
  const why = await prompt("Motif de la suspension", `${p.username} le verra dans son Profil. Pendant la suspension : plus de photo, de commentaire, de concours ni de changement de pseudo ou de photo de profil.`, "", 300);
  if (why == null) return;
  await Admin.suspend(p.id, durations[i][0], why.trim());
  toast(`${p.username} est suspendu`);
  onDone();
}

// ---------- Signalements ----------
async function reports(body, ctx) {
  body.append(spinner());
  const refresh = () => { ctx.changed(); reports(body.replaceChildren() || body, ctx); };
  let rep, qf, ai, rem;
  try {
    [rep, qf, ai, rem] = await Promise.all([Admin.reports(), Admin.quizFlags().catch(() => []), Admin.aiFlags().catch(() => []),
      Admin.removals().catch(() => [])]);
  } catch (e) { fill(body, h("div.card.pad", e.message)); return; }
  const quizOpen = qf.filter((f) => f.reports < 5), quizHidden = qf.filter((f) => f.reports >= 5);
  const aiOpen = ai.filter((a) => a.question);
  fill(body, 
    h("div.section", `Publications signalées (${rep.length})`),
    rep.length ? h("div.list", rep.map((r) => reportCard(r, refresh))) : h("div.small.dim", "Aucune publication signalée."),
    h("div.row", h("div.section.grow", `Photos du quiz signalées (${quizOpen.length})`),
      infoButton("Photos du quiz", "Retirées pour tous à partir de 5 joueurs. « Retirer pour tous » le fait tout de suite ; « Rétablir » efface les signalements (la photo revient dans le quiz).", { small: true })),
    quizOpen.length ? h("div.list", quizOpen.map((f) => quizCard(f, refresh))) : h("div.small.dim", "Aucune photo en attente."),
    quizHidden.length ? h("details.adm-more", h("summary", `Photos retirées pour tous (${quizHidden.length})`), h("div.list", quizHidden.map((f) => quizCard(f, refresh)))) : null,
    h("div.row", h("div.section.grow", `Questions de l'IA signalées (${aiOpen.length})`),
      infoButton("Questions de l'IA", "Retirées pour tous à partir de 3 joueurs. « Retirer » le fait tout de suite ; « Garder » efface les signalements.", { small: true })),
    aiOpen.length ? h("div.list", aiOpen.map((a) => aiCard(a, refresh))) : h("div.small.dim", "Aucune question en attente."),
    h("div.section", "Publications retirées"),
    rem.length ? h("div.list", rem.map(removalRow)) : h("div.small.dim", "Aucune publication retirée."));
}

function reportCard(r, refresh) {
  const reasons = Object.entries(r.reasons || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${reasonLabel(k)} ×${n}`).join(", ");
  return h("div.card.adm-card",
    h("div.row", { style: { alignItems: "flex-start", gap: "10px" } }, thumb(r.photo_path, r.catch_id, refresh),
      h("div.grow", { style: { minWidth: 0 } },
        h("div", h("b", modelOf(r)), r.registration ? ` · ${r.registration}` : "", " — ", userLink(r.user_id, r.username, refresh)),
        h("div.small", plural(r.reports, "signalement", "signalements") + (r.current < r.reports ? ` (${r.current} sur la photo actuelle)` : ""),
          r.source === "old" ? " · photo ancienne" : ""),
        h("div.small.dim", reasons),
        h("div.small.dim", `Par ${(r.reporters || []).join(", ") || "?"} · ${ago(r.last_at)}`))),
    h("div.adm-actions",
      actBtn(".outline", "Voir", async () => openPost(r.catch_id, refresh)),
      actBtn(".danger", "Supprimer", async () => { if (await deleteCatchFlow(r.catch_id, `${modelOf(r)} de ${r.username}`)) refresh(); }),
      actBtn(".outline", "Ignorer", async () => {
        if (!(await confirmBox("Effacer ces signalements ? La publication reste en ligne.", "Ignorer"))) return;
        await Admin.dismissReports(r.catch_id);
        toast("Signalements effacés");
        refresh();
      })));
}

/** Suppression d'une publication : raison (l'auteur la verra), confirmation. true si supprimée. */
export async function deleteCatchFlow(catchId, label = "cette publication") {
  const i = await choose("Pourquoi supprimer cette publication ?", REASONS.map((r) => r.label));
  if (i < 0) return false;
  if (!(await confirmBox(`Supprimer ${label} ? Les photos sont effacées du serveur, les XP retirés, et l'auteur est prévenu (raison : ${REASONS[i].text}).`, "Supprimer", true))) return false;
  try {
    const r = await Admin.deleteCatch(catchId, REASONS[i].id);
    toast(r?.removed === false ? "Publication déjà supprimée" : "Publication supprimée");
    return true;
  } catch (e) { toast(e.message); return false; }
}

const commonsFile = (key) => (key.startsWith("wiki:") ? key.slice(5) : null);
function quizCard(f, refresh) {
  const file = commonsFile(f.photo);
  const src = file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=250` : f.photo;
  const page = file ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}` : f.photo;
  const im = h("img.adm-thumb", { alt: "", loading: "lazy", src });
  im.onclick = () => amodal({ title: file || "Photo", body: [h("img", { src: file ? src.replace("width=250", "width=960") : src, alt: "", style: { width: "100%", borderRadius: "8px" } }),
    h("a.small", { href: page, target: "_blank", rel: "noopener" }, "Page de la photo")] });
  const hidden = f.reports >= 5;
  return h("div.card.adm-card", h("div.row", { style: { alignItems: "flex-start", gap: "10px" } }, im,
    h("div.grow", { style: { minWidth: 0 } }, h("div.adm-file", file || f.photo),
      h("div.small", plural(f.reports, "joueur", "joueurs") + (hidden ? " · retirée pour tous" : "")),
      h("div.small.dim", ago(f.last_at)))),
    h("div.adm-actions",
      !hidden && actBtn(".danger", "Retirer pour tous", async () => { await Admin.quizPhoto(f.photo, "hide"); toast("Photo retirée du quiz"); refresh(); }),
      actBtn(".outline", "Rétablir", async () => { await Admin.quizPhoto(f.photo, "restore"); toast("Photo rétablie"); refresh(); })));
}

function aiCard(a, refresh) {
  const q = a.question || {};
  return h("div.card.adm-card",
    h("div.small.dim", `${a.title || a.article} · ${plural(a.reports, "joueur", "joueurs")} · ${ago(a.last_at)}`),
    h("div", { style: { margin: "4px 0" } }, h("b", q.question || "?")),
    h("ol.adm-options", (q.options || []).map((o, i) => h("li" + (i === q.answer ? ".ok" : ""), o))),
    q.quote && h("div.small.dim", `Citation : « ${q.quote} »`),
    h("div.adm-actions",
      actBtn(".danger", "Retirer", async () => { await Admin.aiRemove(a.article, a.qid); toast("Question retirée"); refresh(); }),
      actBtn(".outline", "Garder", async () => { await Admin.aiKeep(a.article, a.qid); toast("Signalements effacés"); refresh(); })));
}

function removalRow(x) {
  const r = x.reasons || {};
  const why = r.admin ? `retirée par la modération (${reasonLabel(r.admin)})`
    : "signalée : " + Object.entries(r).map(([k, n]) => `${reasonLabel(k)} ×${n}`).join(", ");
  return h("div.card.adm-row", { style: { cursor: "default" } }, h("div.grow",
    h("div", h("b", modelOf(x)), x.registration ? ` · ${x.registration}` : "", " — ", x.user_id ? userLink(x.user_id, x.username) : "compte supprimé"),
    h("div.small.dim", `${why} · ${num(x.xp)} XP retirés · ${when(x.removed_at)}${x.purged ? "" : " · photos pas encore effacées"}`)));
}

// ---------- Publications et commentaires ----------
function posts(body, ctx) {
  const { userId = null, username = "" } = ctx;
  let tab = ctx.tab === "comments" ? "comments" : "photos";
  const sub = h("div.seg.adm-sub");
  const box = h("div.mt");
  const filter = userId ? h("div.adm-filter", `Joueur : ${username}`,
    h("button.btn.small.outline", { onclick: () => ctx.show("posts", { tab }) }, "Tous les joueurs")) : null;
  const paint = () => sub.replaceChildren(...[["photos", "Photos"], ["comments", "Commentaires"]].map(([id, label]) =>
    h("button" + (id === tab ? ".on" : ""), { onclick: () => { tab = id; paint(); load(); } }, label)));
  function load() {
    box.replaceChildren();
    if (tab === "photos") photoList(box, userId, ctx); else commentList(box, userId, ctx);
  }
  body.append(...[filter, sub, box].filter(Boolean));
  paint();
  load();
}

function photoList(box, userId, ctx) {
  const grid = h("div.grid");
  const more = h("button.btn.outline.block.mt", { style: { display: "none" } }, "Afficher plus");
  box.append(grid, more);
  let before = null;
  const refresh = () => { ctx.changed(); box.replaceChildren(); photoList(box, userId, ctx); };
  async function page() {
    more.disabled = true;
    try {
      const rows = await Admin.catches({ before, userId, limit: 30 });
      grid.append(...rows.map((c) => tile(c, refresh)));
      if (rows.length) before = Date.parse(rows.at(-1).created_at);
      more.style.display = rows.length >= 30 ? "" : "none";
      if (!grid.children.length) grid.replaceWith(h("div.dim", "Aucune publication."));
    } catch (e) { toast(e.message); }
    more.disabled = false;
  }
  more.onclick = page;
  page();
}

function tile(c, onChange) {
  return h("div.card.tile", { onclick: () => openPost(c.id, onChange) },
    h("div.ph", h("img", { src: photoUrl(c.photo_path), alt: "", loading: "lazy" }),
      c.report_count > 0 && h("span.adm-badge", plural(c.report_count, "signalement", "signalements"))),
    h("div.nm", modelOf(c)),
    h("div.rr", c.username, c.share_world ? "" : " · privé"),
    h("div.adm-meta", `♥ ${num(c.like_count)} · ${num(c.comment_count)} comm. · ${ago(c.created_at)}`));
}

function commentList(box, userId, ctx) {
  const list = h("div.list");
  const more = h("button.btn.outline.block.mt", { style: { display: "none" } }, "Afficher plus");
  box.append(list, more);
  let before = null;
  const refresh = () => { ctx.changed(); box.replaceChildren(); commentList(box, userId, ctx); };
  async function page() {
    more.disabled = true;
    try {
      const rows = await Admin.comments({ before, userId, limit: 50 });
      list.append(...rows.map((cm) => commentRow(cm, refresh, true)));
      if (rows.length) before = Date.parse(rows.at(-1).created_at);
      more.style.display = rows.length >= 50 ? "" : "none";
      if (!list.children.length) list.append(h("div.dim", "Aucun commentaire."));
    } catch (e) { toast(e.message); }
    more.disabled = false;
  }
  more.onclick = page;
  page();
}

function commentRow(cm, onChange, showCatch = false) {
  return h("div.card.adm-row", { style: { alignItems: "flex-start", cursor: showCatch ? "pointer" : "default" },
    onclick: showCatch ? () => openPost(cm.catch_id, onChange) : null },
  avatar(cm.avatar_path),
  h("div.grow", { style: { minWidth: 0 } },
    h("div.adm-comment", userLink(cm.user_id, cm.username, onChange), "  ", cm.body),
    h("div.small.dim", (showCatch ? `sur ${modelOf(cm)} de ${cm.catch_username || "?"} · ` : "") + when(cm.created_at))),
  actBtn(".danger", icon("trash", 16), async () => {
    if (!(await confirmBox(`Supprimer ce commentaire de ${cm.username || "?"} ?\n\n« ${cm.body} »`, "Supprimer", true))) return;
    await Admin.deleteComment(cm.id);
    toast("Commentaire supprimé");
    onChange();
  }));
}

/** Une publication en grand : photos, informations, commentaires, suppression. */
export function openPost(id, onChange = () => {}) {
  const box = h("div", spinner());
  const m = amodal({ title: "Publication", body: box });
  const changed = () => { render(); onChange(); };
  async function render() {
    let c, comments;
    try { [[c], comments] = await Promise.all([Admin.catches({ id, limit: 1 }), Admin.comments({ catchId: id, limit: 200 })]); }
    catch (e) { fill(box, h("p", e.message)); return; }
    if (!c) { fill(box, h("p", "Cette publication n'existe plus.")); return; }
    const urls = [c.photo_path, ...(c.photos || [])].filter(Boolean).map(photoUrl);
    const source = c.source === "old" ? "photo ancienne" : c.source === "import" ? "ajoutée après coup" : "en direct";
    fill(box, 
      urls.length ? carousel(urls, { fit: "contain" }) : null,
      h("div.mt", h("b", modelOf(c)), c.registration ? ` · ${c.registration}` : "", c.military ? " · militaire" : "", " — ", userLink(c.user_id, c.username, changed)),
      h("div.small.dim", [source, `${num(c.xp)} XP`, `photo du ${when(c.taken_at)}`, `publiée le ${when(c.created_at)}`, c.share_world ? "profil public" : "profil privé"].join(" · ")),
      h("div.small.dim", [c.route, c.operator, `♥ ${num(c.like_count)}`, plural(c.comment_count, "commentaire", "commentaires"),
        plural(c.report_count, "signalement", "signalements")].filter(Boolean).join(" · ")),
      h("div.adm-actions",
        actBtn(".danger", "Supprimer la publication", async () => { if (await deleteCatchFlow(c.id, `ce ${modelOf(c)} de ${c.username}`)) { m.close(); onChange(); } }),
        c.report_count > 0 && actBtn(".outline", "Effacer les signalements", async () => {
          await Admin.dismissReports(c.id); toast("Signalements effacés"); changed();
        }),
        actBtn(".outline", "Ouvrir la page", async () => { m.close(); go("comments/" + c.id); })),
      h("div.section", `Commentaires (${comments.length})`),
      comments.length ? h("div.list", comments.reverse().map((cm) => commentRow(cm, changed))) : h("div.small.dim", "Aucun commentaire."));
  }
  render();
}

// ---------- Serveur : place prise, mémoire vive, processeur, disque ----------
// Limites du plan gratuit de Supabase (à changer si le projet passe à un plan payant)
const FREE = { db: 500e6, storage: 1e9 };
const BUCKET_NAMES = { photos: "Photos des captures", avatars: "Photos de profil" };

/** Taille lisible : 14,1 Mo, 1,25 Go… (unités décimales, comme les limites de Supabase). */
function bytes(b) {
  if (b == null || !isFinite(b)) return "—";
  const f = (v, d) => v.toLocaleString(LOCALE, { maximumFractionDigits: d });
  return b >= 1e9 ? `${f(b / 1e9, 2)} Go` : b >= 1e6 ? `${f(b / 1e6, 1)} Mo` : `${f(b / 1e3, 0)} Ko`;
}
/** Jauge : libellé, « utilisé / total », barre (rouge au-delà de 85 %), pourcentage et détail. */
function meter(label, used, total, detail = "") {
  const ok = used != null && total;
  const pct = ok ? Math.max(0, Math.min(100, (used / total) * 100)) : 0;
  return h("div.adm-meter" + (pct >= 85 ? ".hot" : ""),
    h("div.row", h("span.grow", label), h("span.v", ok ? `${bytes(used)} / ${bytes(total)}` : "—")),
    h("div.bar", h("i", { style: { width: `${pct}%` } })),
    h("div.small.dim", [ok && `${pct.toLocaleString(LOCALE, { maximumFractionDigits: pct < 10 ? 1 : 0 })} %`, detail].filter(Boolean).join(" · ")));
}
/** Jauge sans unité (connexions, processeur en %). */
function gauge(label, value, max, text, detail = "") {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return h("div.adm-meter" + (pct >= 85 ? ".hot" : ""),
    h("div.row", h("span.grow", label), h("span.v", text)),
    h("div.bar", h("i", { style: { width: `${pct}%` } })),
    detail && h("div.small.dim", detail));
}

async function server(body, { show }) {
  body.append(spinner());
  const [res, st] = await Promise.all([Admin.resources().catch((e) => ({ error: e.message })),
    Admin.serverStats().catch((e) => ({ error: e.message }))]);
  const pct = (v) => `${(v * 100).toLocaleString(LOCALE, { maximumFractionDigits: v < 0.1 ? 1 : 0 })} %`;
  const dec2 = (v) => (v == null ? "—" : Number(v).toLocaleString(LOCALE, { maximumFractionDigits: 2 }));
  const parts = [h("div.row", h("div.section.grow", "Place utilisée (plan gratuit)"),
    infoButton("Serveur", [
      "Plane GO tourne sur le plan gratuit de Supabase : une petite machine (environ 0,5 Go de mémoire vive, 2 cœurs partagés), une base de données de 500 Mo au plus et 1 Go pour les photos.",
      "Base de données : comptes, captures, commentaires, questions de l'IA… (sans les photos). Photos : les fichiers envoyés par les joueurs, déjà allégés (environ 200 Ko chacune).",
      "Mémoire vive : elle paraît souvent bien remplie, c'est normal (le serveur garde des choses en mémoire pour aller plus vite). La mémoire d'appoint (swap) sert quand la mémoire vive manque : si elle se remplit et que l'appli devient lente, il faudra une machine plus grosse (plan payant).",
      "Processeur : charge moyenne sur 1, 5 et 15 minutes ; 100 % = les 2 cœurs occupés en permanence.",
      "Pas visible ici : la bande passante (5 Go par mois sur le plan gratuit, surtout les photos affichées) et le total des appels de fonctions. Ils se trouvent dans le tableau de bord Supabase, rubrique Usage.",
    ], { small: true }), h("button.btn.small.outline", { onclick: () => show("server"), title: "Actualiser" }, icon("refresh", 16)))];

  if (res?.error) parts.push(h("div.card.pad", res.error));
  else {
    const photos = res.buckets || [];
    const storageBytes = photos.reduce((a, b) => a + Number(b.bytes || 0), 0);
    parts.push(h("div.card.adm-card",
      meter("Base de données", Number(res.db_bytes), FREE.db, "comptes, captures, commentaires… sans les photos"),
      meter("Photos (stockage)", storageBytes, FREE.storage,
        photos.map((b) => `${BUCKET_NAMES[b.bucket] || b.bucket} : ${num(b.files)} (${bytes(Number(b.bytes))})`).join(" · ") || "aucune photo")));
  }

  parts.push(h("div.section", "Machine du serveur"));
  if (st?.error) parts.push(h("div.card.pad", `Mesures indisponibles pour l'instant (${st.error}).`));
  else {
    const ram = st.ram || {}, swap = st.swap || {}, cpu = st.cpu || {}, disk = st.disk || {};
    const cores = cpu.count || 1;
    parts.push(h("div.card.adm-card",
      meter("Mémoire vive (RAM)", ram.total != null && ram.available != null ? ram.total - ram.available : null, ram.total,
        ram.available != null ? `${bytes(ram.available)} libres` : ""),
      meter("Mémoire d'appoint (swap)", swap.total != null && swap.free != null ? swap.total - swap.free : null, swap.total),
      gauge("Processeur", cpu.load1 ?? 0, cores, cpu.load1 != null ? pct(cpu.load1 / cores) : "—",
        `${cores} cœur${cores > 1 ? "s" : ""} · charge ${dec2(cpu.load1)} / ${dec2(cpu.load5)} / ${dec2(cpu.load15)} (1, 5, 15 min)`
          + (cpu.avg != null ? ` · ${pct(cpu.avg)} en moyenne depuis le démarrage` : "")),
      meter("Disque de la base", disk.size != null && disk.available != null ? disk.size - disk.available : null, disk.size,
        "s'agrandit tout seul quand il se remplit"),
      res && !res.error ? gauge("Connexions à la base", Number(res.connections), Number(res.connections_max),
        `${num(res.connections)} / ${num(res.connections_max)}`) : null,
      h("div.small.dim.mt", [st.boot && `Machine démarrée le ${when(new Date(st.boot * 1000).toISOString())}`,
        res?.postgres && `PostgreSQL ${res.postgres}`,
        st.network?.sent != null && `réseau depuis le démarrage : ${bytes(st.network.sent)} envoyés, ${bytes(st.network.received)} reçus`].filter(Boolean).join(" · "))));
  }

  if (res && !res.error && res.tables?.length) {
    parts.push(h("div.section", "Plus grosses tables"),
      h("table.adm-table", h("thead", h("tr", h("th", "Table"), h("th", "Lignes"), h("th", "Taille"))),
        h("tbody", res.tables.map((t) => h("tr", h("td", t.name.replace(/^public\./, "")),
          h("td.v", Number(t.rows) >= 0 ? num(t.rows) : "—"), h("td.v", bytes(Number(t.bytes))))))));
  }
  fill(body, ...parts);
}

// ---------- Audience : chiffres de Google Analytics (action ga_report de la fonction serveur « admin ») ----------
const SCREENS = { feed: "Feed", world: "Monde", friends: "Amis", contest: "Concours", quiz: "Jeux", live: "Quiz en direct",
  daily: "Quiz du jour", pass: "Sur la carte", practice: "Entraînement", scanner: "Scanner", collection: "Collection", photos: "Photos",
  seen: "Au-dessus", catalog: "Catalogue", profile: "Profil", me: "Profil", ranking: "Classement", admin: "Admin", ac: "Fiche d'un avion",
  comments: "Publication", player: "Page d'un joueur", auth: "Connexion", reset: "Nouveau mot de passe", privacy: "Confidentialité",
  legal: "Mentions légales", terms: "Conditions" };
const screenName = (p) => (p === "/" ? "Accueil" : p.split("/").filter(Boolean).map((x) => SCREENS[x] || x).join(" › "));
const DEVICES = { mobile: "Téléphone", desktop: "Ordinateur", tablet: "Tablette", smarttv: "Télévision" };
const sourceName = (s) => (s === "(direct)" ? "Direct (appli, favori, lien tapé)" : s === "(not set)" ? "Inconnue" : s);
const GA_STEPS = [
  "Sur console.cloud.google.com (même compte Google que Google Analytics), crée un projet, par exemple « Plane GO ».",
  "Menu « API et services › Bibliothèque » : cherche « Google Analytics Data API » et clique sur « Activer ».",
  "Menu « IAM et administration › Comptes de service » : « Créer un compte de service », nom « plane-go-stats », aucun rôle, « OK ».",
  "Ouvre ce compte de service › onglet « Clés » › « Ajouter une clé › Créer une clé › JSON » : un fichier .json se télécharge. Garde-le pour toi.",
  "Dans Google Analytics › Administration › « Gestion des accès à la propriété » : « + », ajoute l'adresse du compte de service (…@….iam.gserviceaccount.com) avec le rôle « Lecteur ».",
  "Dans Supabase › Edge Functions › Secrets : ajoute GA_SERVICE_ACCOUNT avec tout le contenu du fichier .json (Claude peut ouvrir la case pour toi).",
  "Donne à Claude l'« ID de propriété » (Google Analytics › Administration › Détails de la propriété, un nombre) : il l'ajoute en secret GA_PROPERTY_ID.",
];

async function audience(body, { show }) {
  body.append(spinner());
  let r;
  try { r = await Admin.analytics(); } catch (e) { r = { configured: true, error: e.message }; }
  const head = h("div.row", h("div.section.grow", "Audience (Google Analytics)"),
    infoButton("Audience", [
      "Chiffres de Google Analytics : seulement les visiteurs qui ont accepté la mesure d'audience (bandeau à la première visite, réglage du Profil). Ceux qui refusent ne sont pas comptés : les vrais chiffres sont plus hauts (la console Résumé compte, elle, tous les joueurs actifs).",
      "« En ce moment » = visiteurs des 30 dernières minutes. Le reste arrive chez Google avec quelques heures de retard.",
      "Visiteurs = appareils différents (un même joueur sur son téléphone et son ordinateur compte deux fois). Tes propres visites sont comptées aussi.",
      "Sources : site d'où viennent les visiteurs (m.facebook.com = lien ouvert dans Facebook ; « Direct » = appli, favori ou adresse tapée).",
    ], { small: true }),
    h("button.btn.small.outline", { onclick: () => show("audience"), title: "Actualiser" }, icon("refresh", 16)));
  const steps = () => h("ol.adm-steps", GA_STEPS.map((t) => h("li", t)));
  if (!r.configured) {
    fill(body, head, h("div.card.pad",
      h("p", { style: { marginTop: 0 } }, "Le site envoie déjà ses visites à Google Analytics (avec l'accord des joueurs), mais la console n'a pas encore le droit de lire les chiffres. À faire une fois :"),
      steps(),
      h("p.small.dim", `Il manque : ${[r.missing?.account && "GA_SERVICE_ACCOUNT", r.missing?.property && "GA_PROPERTY_ID"].filter(Boolean).join(" et ") || "?"}.`)));
    return;
  }
  if (r.error) {
    fill(body, head, h("div.card.pad",
      h("p", { style: { marginTop: 0 } }, r.error),
      r.account && h("p.small", `Compte de service : ${r.account}. S'il s'agit d'un refus d'accès, vérifie qu'il est « Lecteur » de la propriété (étape 5) et que l'ID de propriété est le bon.`),
      steps()));
    return;
  }
  const t7 = r.totals?.d7 || {}, t28 = r.totals?.d28 || {};
  const avg = t28.users ? Math.round(t28.engagement / t28.users) : 0;
  const mmss = `${Math.floor(avg / 60)} min ${String(avg % 60).padStart(2, "0")} s`;
  const days = r.days || [], max = Math.max(1, ...days.map((d) => d.users));
  // 28 barres : date écrite une barre sur 7 (et la dernière), sinon les chiffres se chevauchent sur un téléphone
  const bars = h("div.adm-bars", days.map((d, i) => h("div.b", { title: `${d.date} : ${num(d.users)} visiteurs, ${num(d.views)} pages vues` },
    h("i", { style: { height: `${Math.round((d.users / max) * 100)}%` } }),
    h("span", (days.length - 1 - i) % 7 === 0 ? `${d.date.slice(8)}/${d.date.slice(5, 7)}` : "\u00a0"))));
  const table = (title, cols, rows) => rows?.length ? [h("div.section", title), h("table.adm-table",
    h("thead", h("tr", cols.map(([label], i) => h("th", label)))),
    h("tbody", rows.map((row) => h("tr", cols.map(([, get], i) => (i ? h("td.v", num(get(row))) : h("td", get(row))))))))] : [];
  fill(body, head,
    stats([stat("En ce moment", num(r.realtime), r.realtime > 0), stat("Visiteurs 7 j", num(t7.users)), stat("Visiteurs 28 j", num(t28.users)),
      stat("Nouveaux 28 j", num(t28.new)), stat("Pages vues 28 j", num(t28.views)), stat("Temps / visiteur", avg ? mmss : "—")]),
    h("div.small.dim.mt", "Visiteurs par jour, 28 derniers jours"),
    days.length ? bars : h("div.small.dim", "Pas encore de visite enregistrée."),
    ...table("Écrans les plus vus (28 j)", [["Écran", (x) => screenName(x.name)], ["Vues", (x) => x.views], ["Visiteurs", (x) => x.users]], r.pages),
    ...table("D'où ils viennent (28 j)", [["Source", (x) => sourceName(x.name)], ["Visites", (x) => x.sessions]], r.sources),
    ...table("Pays (28 j)", [["Pays", (x) => x.name], ["Visiteurs", (x) => x.users]], r.countries),
    ...table("Appareils (28 j)", [["Appareil", (x) => DEVICES[x.name] || x.name], ["Visiteurs", (x) => x.users]], r.devices),
    h("div.small.dim.mt", "Seulement les visiteurs qui ont accepté la mesure d'audience."));
}

// ---------- Messages du formulaire de contact ----------
async function messages(body, ctx) {
  body.append(spinner());
  let list;
  try { list = await Admin.messages(); } catch (e) { fill(body, h("div.card.pad", e.message)); return; }
  const refresh = () => { ctx.changed(); body.replaceChildren(); messages(body, ctx); };
  // Messages affichés = vus : ils ne comptent plus dans la pastille de l'onglet Profil
  Badges.messagesSeen(Math.max(0, ...list.map((m) => Number(m.id) || 0)));
  fill(body, 
    h("div.row", h("div.section.grow", `Messages reçus (${list.length})`),
      infoButton("Messages", "Envoyés avec le formulaire « Contactez-nous » (plane-go.com/contact). Effacés automatiquement au bout d'un an.", { small: true })),
    list.length ? h("div.list", list.map((msg) => messageCard(msg, refresh))) : h("div.small.dim", "Aucun message."));
}

function messageCard(msg, refresh) {
  const reply = msg.email ? `mailto:${msg.email}?subject=${encodeURIComponent("Re: " + msg.subject)}` : null;
  return h("div.card.adm-card",
    h("div.row", { style: { alignItems: "baseline" } }, h("b.grow", msg.subject), h("span.small.dim", when(msg.created_at))),
    h("div.small", msg.name, " · ", msg.email ? h("a", { href: `mailto:${msg.email}`, target: "_blank", rel: "noopener" }, msg.email) : "pas d'e-mail",
      msg.user_id ? [" · compte ", userLink(msg.user_id, msg.username || "?")] : ""),
    h("div.adm-msg", msg.message),
    msg.page && h("div.small.dim", `Envoyé depuis : ${msg.page}`),
    h("div.adm-actions",
      reply && h("a.btn.small.primary", { href: reply, target: "_blank", rel: "noopener" }, "Répondre"),
      msg.email && actBtn(".outline", "Copier l'adresse", async () => copy(msg.email)),
      actBtn(".danger", "Supprimer", async () => {
        if (!(await confirmBox(`Supprimer le message de ${msg.name} ?`, "Supprimer", true))) return;
        await Admin.deleteMessage(msg.id);
        toast("Message supprimé");
        refresh();
      })));
}

// Page d'un joueur (#player/<id>), ouverte en touchant son avatar ou son pseudo dans le feed, le classement, la liste
// d'amis ou les commentaires : avatar, grade, XP, chiffres de sa collection et ses photos.
// Photos visibles si le joueur a coché « Profil public » dans son Profil (profiles.share_world), ou par ses amis (ils
// voient déjà ses photos dans le feed Amis). Sinon : « Profil privé ». Le serveur applique la même règle (règle
// « voir captures » de catches : ami, ou share_world) : un profil privé ne renvoie aucune photo à un non-ami.
import { Blocked, blockUser } from "../blocks.js";
import { LOCALE } from "../i18n.js";
import { h, toast, rarityMark, icon } from "../util.js";
import { Supa } from "../supa.js";
import { Cloud, otherOf, isIncoming } from "../cloud.js";
import { flagOf } from "../game.js";
import { back, go } from "../app.js";

/** Rend un avatar, un pseudo ou une ligne cliquable vers la page du joueur (sans ouvrir la publication autour). */
export function linkPlayer(el, id) {
  if (!el || !id || !Supa.isLoggedIn) return el;
  el.classList.add("player-link");
  el.setAttribute("role", "link");
  el.tabIndex = 0;
  const open = (ev) => { ev.stopPropagation(); go("player/" + id); };
  el.addEventListener("click", open);
  el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") open(ev); });
  return el;
}

/** Page de la publication (comme depuis le feed) : données passées par sessionStorage. */
function openPost(c) {
  sessionStorage.setItem("catch_" + c.id, JSON.stringify({ ...c, user: c.user && { id: c.user.id, username: c.user.username,
    avatarPath: c.user.avatarPath, xp: c.user.xp }, photo: c.photoUrl, photos: c.photoUrls, index: 0 }));
  go("comments/" + c.id);
}

function tile(c) {
  const img = h("img", { alt: "", loading: "lazy", src: c.photoUrl });
  const n = c.photoPaths.length, old = c.source === "old";
  return h("div.card.tile", { onclick: () => openPost(c) },
    h("div.ph", img, n > 1 ? h("span.album-count", { title: `${n} photos de cet avion` }, icon("image", 13), String(n)) : null),
    h("div.strip", { style: { background: c.rarity.color } }),
    h("div.nm", (c.countryIso?.length === 2 ? flagOf(c.countryIso) + " " : "") + (c.modelName || "Avion")),
    h("div.rr", rarityMark(c.rarity, `${c.rarity.label} · ${old ? "ancienne" : c.xp + " XP"}`)));
}

const stat = (k, v) => h("div.fly-stat", h("span.k", k), h("span.v", v));

export function playerPage(view, [id]) {
  const head = h("div.card.pad.player-head", h("div.spinner"));
  const stats = h("div");
  const body = h("div");
  view.append(h("div.page-head", h("button.back", { onclick: back, "aria-label": "Retour" }, "‹"), h("h1.title.grow", "Joueur")),
    head, stats, body);
  if (!Supa.isLoggedIn) {
    head.replaceChildren(h("div", "Connecte-toi pour voir les profils des joueurs."),
      h("button.btn.primary.mt", { onclick: () => go("auth") }, "Se connecter"));
    return;
  }
  if (!id || Blocked.has(id)) { head.replaceChildren(h("div.dim", "Tu as bloqué ce joueur.")); return; }
  let alive = true;

  (async () => {
    const [p, fs] = await Promise.all([Cloud.profile(id), Cloud.friendships().catch(() => [])]);
    if (!alive) return;
    if (!p) { head.replaceChildren(h("div.dim", "Joueur introuvable.")); return; }
    const mine = id === Supa.userId;
    const rel = fs.find((f) => otherOf(f, Supa.userId)?.id === id); // amitié, ou demande en cours
    const friend = !!rel?.accepted, incoming = rel && !rel.accepted && isIncoming(rel, Supa.userId), sent = rel && !rel.accepted && !incoming;
    const visible = mine || friend || p.shareWorld === true;

    const av = h("img.avatar.lg", { alt: "", src: p.avatarUrl || "icons/avatar.svg" });
    av.onerror = () => { av.src = "icons/avatar.svg"; };
    const actions = h("div.row.mt", { style: { gap: "8px", flexWrap: "wrap" } });
    if (mine) actions.append(h("button.btn.small.outline", { onclick: () => go("profile/me") }, "Mon profil"));
    else {
      if (!friend) {
        const add = h("button.btn.small.primary", { disabled: sent, onclick: async () => {
          add.disabled = true;
          try { await Cloud.addFriend(id); add.textContent = incoming ? "Vous êtes amis" : "Demande envoyée"; toast(incoming ? `${p.username} est maintenant ton ami` : `Demande d'ami envoyée à ${p.username}`); }
          catch (e) { add.disabled = false; toast(e.message); }
        } }, sent ? "Demande envoyée" : incoming ? "Accepter sa demande d'ami" : "Ajouter en ami");
        actions.append(add);
      }
      actions.append(h("button.btn.small.outline", { title: "Bloquer ce joueur", onclick: async () => { if (await blockUser(id, p.username)) back(); } }, "Bloquer"));
    }
    head.replaceChildren(h("div.row", { style: { gap: "14px", alignItems: "center" } }, av,
      h("div.grow", { style: { minWidth: 0 } }, h("div.player-name", p.username),
        h("div.small.dim", `${p.level.emblem} Niv. ${p.level.number} · ${p.level.name}`),
        h("div.tags", { style: { marginTop: "6px" } }, friend ? h("span.chip.small", "Ami") : null, mine ? h("span.chip.small", "C'est toi") : null,
          h("span.chip.small", p.shareWorld === true ? "Profil public" : "Profil privé")))),
      actions);

    if (!visible) {
      body.replaceChildren(h("div.card.pad.mt", h("b", "Profil privé"),
        h("div.small.dim", { style: { marginTop: "4px" } }, "Ses photos ne sont visibles que par ses amis.")));
      return;
    }

    // Chiffres de sa collection : les photos anciennes comptent comme avions et modèles attrapés (sans XP), comme dans
    // la Collection ; leur nombre est rappelé à part
    Cloud.playerStats(id).then((rows) => {
      if (!alive) return;
      const old = rows.filter((r) => r.source === "old").length;
      const models = new Set(rows.map((r) => r.type || r.model).filter(Boolean)).size;
      const cells = [stat("Avions", String(rows.length)), stat("Modèles", String(models)), stat("XP", p.xp.toLocaleString(LOCALE))];
      if (old) cells.push(stat("Anciennes", String(old)));
      stats.replaceChildren(h("div.fly-stats.player-stats", { style: { gridTemplateColumns: `repeat(${cells.length}, 1fr)` } }, ...cells));
    }).catch(() => {});

    const grid = h("div.grid.mt");
    const more = h("button.btn.outline.block.mt", { style: { display: "none" } }, "Afficher plus");
    const note = h("div.small.dim.mt");
    body.replaceChildren(h("div.section", mine ? "Mes photos" : "Ses photos"), grid, more, note);
    let before = null;
    async function page() {
      more.disabled = true;
      try {
        const list = await Cloud.playerCatches(id, before);
        if (!alive) return;
        grid.append(...list.map(tile));
        before = list.length ? list[list.length - 1].createdAt : before;
        more.style.display = list.length >= Cloud.PLAYER_PAGE ? "" : "none";
        if (!grid.children.length) note.textContent = mine ? "Tu n'as pas encore publié de photo." : "Pas encore de photo publiée.";
      } catch (e) { toast(e.message); }
      more.disabled = false;
    }
    more.onclick = page;
    page();
  })().catch((e) => { if (alive) { head.replaceChildren(h("div.dim", "Profil indisponible pour l'instant.")); toast(e.message); } });

  return () => { alive = false; };
}

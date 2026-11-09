// Onglet Amis : recherche par pseudo, demandes, liste d'amis classée par XP.
import { Blocked, blockUser } from "../blocks.js";
import { h, toast, confirmBox, icon } from "../util.js";
import { Supa } from "../supa.js";
import { Cloud, otherOf, isIncoming } from "../cloud.js";
import { loginGate } from "../app.js";
import { linkPlayer } from "./player.js";
import { Badges } from "../badges.js";

export function friends(view) {
  if (loginGate(view, "Connecte-toi pour ajouter des amis et comparer vos collections.")) return;
  const search = h("input.input.grow", { placeholder: "Pseudo d'un ami…", enterKeyHint: "search",
    onkeydown: (e) => { if (e.key === "Enter") doSearch(); } });
  const box = h("div");
  view.append(h("div.row", search, h("button.btn.primary", { onclick: doSearch }, "Chercher")), box);
  let friendships = [], results = [];

  async function reload() {
    try { friendships = (await Cloud.friendships()).filter((f) => !Blocked.has(otherOf(f, Supa.userId).id)); render(); } catch (e) { toast(e.message); }
    Badges.refresh(); // pastille de l'onglet Profil (demandes d'ami en attente)
  }
  const block = (p) => async () => { if (await blockUser(p.id, p.username)) { results = results.filter((x) => x.id !== p.id); reload(); } };
  async function doSearch() {
    const q = search.value.trim();
    if (q.length < 2) { toast("2 caractères minimum"); return; }
    try { results = (await Cloud.searchUsers(q)).filter((p) => !Blocked.has(p.id)); render(); if (!results.length) toast(`Aucun joueur trouvé pour « ${q} »`); }
    catch (e) { toast(e.message); }
  }
  async function act(op) { try { await op(); } catch (e) { toast(e.message); } await reload(); }

  function person(p, { note, action, onAction, secondary, onSecondary, onLong, onBlock, stack = false } = {}) {
    const av = h("img.avatar.sm", { alt: "", src: p.avatarUrl || "icons/avatar.svg" });
    av.onerror = () => { av.src = "icons/avatar.svg"; };
    // Avatar et pseudo : page du joueur (les boutons de la ligne gardent leur rôle)
    const who = linkPlayer(h("div.grow", h("div", { style: { fontWeight: 700 } }, p.username), h("div.small.dim", `${p.level.title} • ${p.xp} XP${note ? "  ·  " + note : ""}`)), p.id);
    const buttons = [
      secondary && h("button.btn.small.outline", { onclick: onSecondary }, secondary),
      action && h("button.btn.small.primary", { onclick: onAction }, action),
      onBlock && h("button.btn.small.outline", { onclick: onBlock, "aria-label": "Bloquer", title: "Bloquer ce joueur" }, "Bloquer"),
      onLong && h("button.btn.small.danger", { onclick: onLong, "aria-label": "Retirer" }, icon("trash", 16)),
    ].filter(Boolean);
    // Demande reçue : boutons sur une ligne à part, assez grands pour répondre d'un doigt
    if (stack) return h("div.card.pad.req-card", h("div.row", linkPlayer(av, p.id), who), h("div.row.req-actions", ...buttons));
    return h("div.card.pad.row", linkPlayer(av, p.id), who, ...buttons);
  }

  function render() {
    const me = Supa.userId, parts = [];
    if (results.length) {
      parts.push(h("div.section", "Résultats de la recherche"));
      for (const p of results) {
        const f = friendships.find((x) => otherOf(x, me).id === p.id);
        parts.push(!f ? person(p, { action: "Ajouter", onAction: () => act(() => Cloud.addFriend(p.id)), secondary: "Bloquer", onSecondary: block(p) })
          : f.accepted ? person(p, { note: "✓ Ami" })
            : isIncoming(f, me) ? person(p, { action: "Accepter", onAction: () => act(() => Cloud.accept(p.id)) })
              : person(p, { note: "Demande envoyée" }));
      }
    }
    const incoming = friendships.filter((f) => isIncoming(f, me));
    if (incoming.length) {
      parts.push(h("div.section.req-head", "Demandes reçues", h("span.badge.seg-badge", { "data-notr": "" }, String(incoming.length))));
      incoming.forEach((f) => { const p = otherOf(f, me); parts.push(person(p, { action: "Accepter", onAction: () => act(() => Cloud.accept(p.id)),
        secondary: "Refuser", onSecondary: () => act(() => Cloud.removeFriend(p.id)), onBlock: block(p), stack: true })); });
    }
    const list = friendships.filter((f) => f.accepted).map((f) => otherOf(f, me)).sort((a, b) => b.xp - a.xp);
    parts.push(h("div.section", `Mes amis (${list.length})`));
    if (!list.length) parts.push(h("p.dim", "Cherchez vos amis par leur pseudo ci-dessus. Une fois amis, vous verrez leurs captures dans le feed."));
    list.forEach((p, i) => parts.push(person(p, { note: `#${i + 1}`, onBlock: block(p), onLong: async () => {
      if (await confirmBox(`Retirer ${p.username} de vos amis ?`, "Retirer", true)) act(() => Cloud.removeFriend(p.id));
    } })));
    const sent = friendships.filter((f) => !f.accepted && !isIncoming(f, me));
    if (sent.length) {
      parts.push(h("div.section", "Demandes envoyées"));
      sent.forEach((f) => { const p = otherOf(f, me); parts.push(person(p, { secondary: "Annuler", onSecondary: () => act(() => Cloud.removeFriend(p.id)) })); });
    }
    box.replaceChildren(h("div.list", parts));
  }
  reload();
}

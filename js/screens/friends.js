// Onglet Amis : recherche par pseudo, demandes, liste d'amis classée par XP.
import { h, toast, confirmBox, icon } from "../util.js";
import { Supa } from "../supa.js";
import { Cloud, otherOf, isIncoming } from "../cloud.js";
import { loginGate } from "../app.js";

export function friends(view) {
  if (loginGate(view, "Connecte-toi pour ajouter des amis et comparer vos collections.")) return;
  const search = h("input.input.grow", { placeholder: "Pseudo d'un ami…", enterKeyHint: "search",
    onkeydown: (e) => { if (e.key === "Enter") doSearch(); } });
  const box = h("div");
  view.append(h("div.row", search, h("button.btn.primary", { onclick: doSearch }, "Chercher")), box);
  let friendships = [], results = [];

  async function reload() { try { friendships = await Cloud.friendships(); render(); } catch (e) { toast(e.message); } }
  async function doSearch() {
    const q = search.value.trim();
    if (q.length < 2) { toast("2 caractères minimum"); return; }
    try { results = await Cloud.searchUsers(q); render(); if (!results.length) toast(`Aucun joueur trouvé pour « ${q} »`); }
    catch (e) { toast(e.message); }
  }
  async function act(op) { try { await op(); } catch (e) { toast(e.message); } await reload(); }

  function person(p, { note, action, onAction, secondary, onSecondary, onLong } = {}) {
    const av = h("img.avatar.sm", { alt: "", src: p.avatarUrl || "icons/avatar.svg" });
    av.onerror = () => { av.src = "icons/avatar.svg"; };
    const el = h("div.card.pad.row", av,
      h("div.grow", h("div", { style: { fontWeight: 700 } }, p.username), h("div.small.dim", `${p.level.title} • ${p.xp} XP${note ? "  ·  " + note : ""}`)),
      secondary && h("button.btn.small.outline", { onclick: onSecondary }, secondary),
      action && h("button.btn.small.primary", { onclick: onAction }, action));
    if (onLong) el.append(h("button.btn.small.danger", { onclick: onLong, "aria-label": "Retirer" }, icon("trash", 16)));
    return el;
  }

  function render() {
    const me = Supa.userId, parts = [];
    if (results.length) {
      parts.push(h("div.section", "Résultats de la recherche"));
      for (const p of results) {
        const f = friendships.find((x) => otherOf(x, me).id === p.id);
        parts.push(!f ? person(p, { action: "Ajouter", onAction: () => act(() => Cloud.addFriend(p.id)) })
          : f.accepted ? person(p, { note: "✓ Ami" })
            : isIncoming(f, me) ? person(p, { action: "Accepter", onAction: () => act(() => Cloud.accept(p.id)) })
              : person(p, { note: "Demande envoyée" }));
      }
    }
    const incoming = friendships.filter((f) => isIncoming(f, me));
    if (incoming.length) {
      parts.push(h("div.section", "Demandes reçues"));
      incoming.forEach((f) => { const p = otherOf(f, me); parts.push(person(p, { action: "Accepter", onAction: () => act(() => Cloud.accept(p.id)),
        secondary: "Refuser", onSecondary: () => act(() => Cloud.removeFriend(p.id)) })); });
    }
    const list = friendships.filter((f) => f.accepted).map((f) => otherOf(f, me)).sort((a, b) => b.xp - a.xp);
    parts.push(h("div.section", `Mes amis (${list.length})`));
    if (!list.length) parts.push(h("p.dim", "Cherchez vos amis par leur pseudo ci-dessus. Une fois amis, vous verrez leurs captures dans le feed."));
    list.forEach((p, i) => parts.push(person(p, { note: `#${i + 1}`, onLong: async () => {
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

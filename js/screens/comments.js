// Page d'une publication du feed : photo du joueur, fiche de l'avion (comme dans le Scanner), likes et commentaires.
import { h, timeAgo, toast, confirmBox, icon } from "../util.js";
import { Supa } from "../supa.js";
import { Cloud, profileFrom } from "../cloud.js";
import { rarityByName } from "../game.js";
import { aircraftInfoCard, savePhoto, photoName, carousel } from "../ui.js";
import { back } from "../app.js";
import { reportButton } from "../report.js";

export function commentsPage(view, [id]) {
  let meta = null;
  try { meta = JSON.parse(sessionStorage.getItem("catch_" + id) || "null"); } catch { /* rien */ }
  const top = h("div");
  const likers = h("div.small", { style: { color: "var(--red)" } });
  const list = h("div.list.mt");
  const input = h("textarea.input", { rows: 2, maxLength: 500, placeholder: "Écrire un commentaire…" });
  const send = h("button.btn.primary", "Envoyer");
  const writeRow = h("div.row.mt", input, send);
  const friendsOnly = h("div.card.pad.mt", { style: { display: "none" } }); // publication du feed Monde d'un joueur qui n'est pas mon ami
  const flagBox = h("div.mt2", { style: { textAlign: "center" } }); // « Signaler cette publication » (pas la mienne)
  const showFlag = (c) => {
    const b = reportButton({ id, userId: c.userId || c.user?.id, user: c.user }, () => {
      flagBox.replaceChildren(h("div.small.dim", "Publication signalée : merci ! Tu ne la verras plus dans le feed."));
    }, "Signaler cette publication");
    if (b) { b.classList.add("wide"); flagBox.replaceChildren(b); }
  };
  view.append(
    h("div.page-head", h("button.back", { onclick: back, "aria-label": "Retour" }, "‹"), h("h1.title.grow", "Publication")),
    top, h("div.section", "Commentaires"), likers, list, writeRow, friendsOnly, flagBox);

  /** Commentaires réservés aux amis de l'auteur : sinon, on propose de l'ajouter en ami. */
  async function checkFriend(c) {
    const author = c.userId || c.user?.id;
    if (!author || !Supa.isLoggedIn) return;
    const ids = await Cloud.friendIds().catch(() => null);
    if (!ids || ids.includes(author)) return;
    list.style.display = "none"; writeRow.style.display = "none";
    const name = c.user?.username || "ce joueur";
    const add = h("button.btn.outline.mt", { onclick: async () => {
      add.disabled = true;
      try { await Cloud.addFriend(author); add.textContent = "Demande envoyée"; toast(`Demande d'ami envoyée à ${name}`); }
      catch (e) { add.disabled = false; toast(e.message); }
    } }, `Ajouter ${name} en ami`);
    friendsOnly.replaceChildren(h("div", `Les commentaires sont réservés aux amis de ${name}. Tu peux liker sa publication depuis le feed Monde.`), add);
    friendsOnly.style.display = "";
  }

  /** En-tête : photo du joueur, qui l'a attrapé, puis la fiche de l'avion. */
  function renderTop(c) {
    const rarity = c.rarity?.stars ? c.rarity : rarityByName(c.rarity?.key || c.rarity);
    const user = c.user ? profileFrom({ id: c.user.id, username: c.user.username, avatar_path: c.user.avatarPath, xp: c.user.xp }) : null;
    const model = c.modelName || "";
    // Photo du joueur, ou toutes ses photos de cet avion (album) en carrousel
    const photos = (c.photos?.length ? c.photos : c.photoUrls?.length ? c.photoUrls : [c.photo || c.photoUrl]).filter(Boolean);
    const car = photos.length ? carousel(photos, { fit: "contain" }) : null;
    // Ouvert depuis le feed sur la 2e photo de l'album : on y reste
    if (car && c.index > 0) requestAnimationFrame(() => { const t = car.querySelector(".car-track"); t.scrollLeft = c.index * t.clientWidth; });
    top.replaceChildren(...[
      car,
      car && h("div.row.mt", { style: { justifyContent: "flex-end" } },
        h("button.btn.small.outline", { onclick: () => savePhoto(photos[car.index()] || photos[0], photoName(model, c.takenAt)) }, icon("download", 16),
          photos.length > 1 ? " Enregistrer cette photo" : " Enregistrer la photo")),
      h("h3", { style: { marginBottom: 0 } }, `${user?.username || "Un spotter"} a attrapé ${model ? "un " + model : "un avion"}`),
      h("div.small.dim", [user && `${user.level.emblem} ${user.level.name}`, c.takenAt && timeAgo(c.takenAt)].filter(Boolean).join(" · ")),
      aircraftInfoCard({ ...c, rarity }),
    ].filter(Boolean));
  }
  if (meta) { renderTop(meta); checkFriend(meta); showFlag(meta); }
  else top.append(h("div.spinner"));
  // Version à jour depuis le serveur (indispensable à l'ouverture depuis une notification)
  Cloud.catchById(id).then((c) => {
    if (c && !meta) { renderTop({ ...c, photo: c.photoUrl, modelName: c.modelName }); checkFriend(c); showFlag(c); }
    else if (!meta) top.replaceChildren(h("div.empty", "Cette publication n'existe plus ou n'est visible que par les amis de son auteur."));
  }).catch((e) => { if (!meta) top.replaceChildren(h("div.empty", e.message)); });

  send.onclick = async () => {
    const body = input.value.trim();
    if (!body) return;
    send.disabled = true;
    try { await Cloud.addComment(id, body); input.value = ""; await reload(); }
    catch (e) { toast(e.message); } finally { send.disabled = false; }
  };

  async function reload() {
    try {
      const [comments, people] = await Promise.all([Cloud.comments(id), Cloud.likers(id)]);
      likers.textContent = people.length ? "♥ Aimé par " + people.map((p) => p.username).join(", ") : "Pas encore de ♥ — soyez le premier !";
      list.replaceChildren(...(comments.length ? comments.map((c) => {
        const av = h("img.avatar.sm", { alt: "", src: c.user?.avatarUrl || "icons/avatar.svg" });
        av.onerror = () => { av.src = "icons/avatar.svg"; };
        return h("div.row", { style: { alignItems: "flex-start" } }, av,
          h("div.grow", h("div", h("b", c.user?.username || "?"), "  ", c.body), h("div.small.dim", timeAgo(c.createdAt))),
          c.userId === Supa.userId && h("button.btn.small.danger", { "aria-label": "Supprimer ce commentaire", onclick: async () => {
            if (await confirmBox("Supprimer ce commentaire ?", "Supprimer", true)) { await Cloud.deleteComment(c.id).catch((e) => toast(e.message)); reload(); }
          } }, icon("trash", 16)));
      }) : [h("div.dim", "Aucun commentaire pour l'instant.")]));
    } catch (e) { toast(e.message); }
  }
  reload();
}

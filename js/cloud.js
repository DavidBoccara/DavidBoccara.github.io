// Opérations en ligne (profil, captures, feed, likes, commentaires, amis, classements) + synchronisation.
import { Supa, ApiError } from "./supa.js";
import { Collection, Photos, QuizStore, Player, entryPhotoItems, albumSynced } from "./store.js";
import { levelOf, rarityByName, prettyModel } from "./game.js";
import { uuid, compressForUpload, ls } from "./util.js";
import { t } from "./i18n.js";

const me = () => { if (!Supa.userId) throw new ApiError(401, "Connectez-vous d'abord"); return Supa.userId; };
const iso = (ms) => new Date(ms).toISOString();

export function profileFrom(o) {
  if (!o) return null;
  return { id: o.id, username: o.username, avatarPath: o.avatar_path || null, xp: o.xp | 0,
    // Feed 🌍 Monde : true = publications partagées avec tout le monde, false = amis seulement,
    // null = pas encore répondu, undefined = réglage pas encore installé sur le serveur
    shareWorld: "share_world" in o ? o.share_world : undefined,
    get avatarUrl() { return this.avatarPath ? Supa.publicUrl("avatars", this.avatarPath) : null; },
    get level() { return levelOf(this.xp); } };
}

export function catchFrom(o) {
  const count = (k) => o[k]?.[0]?.count || 0;
  return {
    id: o.id, userId: o.user_id, user: profileFrom(o.profiles), hex: o.hex, callsign: o.callsign || "", registration: o.registration || "",
    type: o.type || "", model: o.model || "", operator: o.operator || "", countryIso: o.country_iso || "", countryName: o.country_name || "",
    military: !!o.military, rarity: rarityByName(o.rarity), xp: o.xp | 0, newModel: !!o.new_model, distanceKm: o.distance_km,
    flightKm: o.flight_km, route: o.route || "", photoPath: o.photo_path, source: o.source, takenAt: Date.parse(o.taken_at) || 0,
    createdAt: Date.parse(o.created_at) || 0, likeCount: count("likes"), commentCount: count("comments"), likedByMe: !!o.liked_by_me,
    isFriend: o.is_friend ?? true, // feed Monde : auteur ami (ou moi) ? Sinon, pas de commentaires (réservés aux amis)
    photoPaths: [o.photo_path, ...(o.photos || [])].filter(Boolean), // photo principale puis l'album (carrousel)
    get photoUrl() { return Supa.publicUrl("photos", this.photoPath); },
    get photoUrls() { return this.photoPaths.map((p) => Supa.publicUrl("photos", p)); },
    get modelName() { return prettyModel(this.model || this.type); },
  };
}

const CATCH_SELECT = "*,profiles!catches_user_id_fkey(id,username,avatar_path,xp),likes(count),comments(count)";
const PROFILE_SEL = "id,username,avatar_path,xp";

export const Cloud = {
  async profile(id = me()) { return profileFrom((await Supa.select(`profiles?id=eq.${id}&select=*`))[0]); },
  async setUsername(name) { return profileFrom(await Supa.rpc("update_profile", { p_username: name.trim() })); },
  async setAvatar(blob) {
    const path = `${me()}/avatar_${Date.now()}.jpg`;
    const old = Player.profile?.avatarPath || (await Cloud.profile().catch(() => null))?.avatarPath || null;
    // Photo de profil (affichée en petit) : 400 px et 60 Ko au plus
    await Supa.upload("avatars", path, await compressForUpload(blob, { maxSide: 400, maxBytes: 60 * 1024, minSide: 256 }));
    const p = profileFrom(await Supa.rpc("update_profile", { p_avatar_path: path }));
    if (old && old !== path) await Supa.removeFile("avatars", old).catch(() => {}); // l'ancienne photo ne reste pas sur le serveur
    return p;
  },

  async uploadCatch(e, blob) {
    const path = `${me()}/${uuid()}.jpg`;
    // La photo gardée sur le téléphone reste en haute définition ; celle du serveur est allégée (1600 px, ≈ 200 Ko)
    await Supa.upload("photos", path, await compressForUpload(blob));
    const row = {
      hex: e.hex, callsign: e.callsign, registration: e.registration, type: e.type, model: e.model, operator: e.operator,
      country_iso: e.countryIso, country_name: e.countryName, military: e.military, rarity: e.rarity, xp: e.xp,
      new_model: e.newModel, route: e.route, photo_path: path, source: e.source, taken_at: iso(e.takenAt),
    };
    if (e.distanceKm != null) row.distance_km = e.distanceKm;
    if (e.flightKm != null) row.flight_km = e.flightKm;
    try { return await Supa.insert("catches", row); }
    catch (ex) { await Supa.removeFile("photos", path); throw ex; }
  },
  /** Remplace la photo d'une capture en ligne (même avion, plus belle photo) ; renvoie le nouveau chemin. */
  async replaceCatchPhoto(remoteId, blob, takenAt) {
    const path = `${me()}/${uuid()}.jpg`;
    await Supa.upload("photos", path, await compressForUpload(blob));
    let old = null;
    try { old = await Supa.rpc("replace_catch_photo", { p_catch_id: remoteId, p_photo_path: path, p_taken_at: iso(takenAt) }); }
    catch (ex) { await Supa.removeFile("photos", path).catch(() => {}); throw ex; }
    if (old && old !== path) await Supa.removeFile("photos", old).catch(() => {});
    return path;
  },
  myCatches: () => Supa.select(`catches?user_id=eq.${me()}&select=${CATCH_SELECT}&order=created_at.desc&limit=1000`),
  /** Supprime une capture et ses photos (chemin unique ou liste : photo principale et album). */
  async deleteCatch(id, photoPaths) {
    await Supa.delete(`catches?id=eq.${id}`);
    for (const p of [].concat(photoPaths || []).filter(Boolean)) await Supa.removeFile("photos", p).catch(() => {});
  },
  /** Envoie une photo de l'album (allégée comme les autres) ; renvoie son chemin. */
  async uploadPhoto(blob) {
    const path = `${me()}/${uuid()}.jpg`;
    await Supa.upload("photos", path, await compressForUpload(blob));
    return path;
  },
  /** Album d'une capture en ligne : paths[0] = photo principale. Efface du stockage les photos retirées. */
  async setCatchPhotos(remoteId, paths) {
    const removed = await Supa.rpc("set_catch_photos", { p_catch_id: remoteId, p_photos: paths });
    for (const p of removed || []) await Supa.removeFile("photos", p).catch(() => {});
  },

  /** Une capture (si elle est visible : la mienne ou celle d'un ami), sinon null. */
  async catchById(id) {
    const o = (await Supa.select(`catches?id=eq.${id}&select=${CATCH_SELECT}`))[0];
    return o ? catchFrom(o) : null;
  },
  /** Page d'un joueur : ses publications, 30 par page (le serveur ne renvoie rien d'un profil privé à un non-ami). */
  PLAYER_PAGE: 30,
  async playerCatches(userId, before) {
    const filter = before ? `&created_at=lt.${Supa.enc(iso(before))}` : "";
    return (await Supa.select(`catches?select=${CATCH_SELECT}&user_id=eq.${userId}&order=created_at.desc&limit=${Cloud.PLAYER_PAGE}${filter}`)).map(catchFrom);
  },
  /** Chiffres de la page d'un joueur : une ligne légère par publication. */
  playerStats: (userId) => Supa.select(`catches?select=type,model,source&user_id=eq.${userId}&limit=5000`),
  /** Mes amis (acceptés) et moi. */
  async friendIds() {
    const rows = await Supa.select("friendships?status=eq.accepted&select=requester,addressee");
    return [...new Set([me(), ...rows.flatMap((r) => [r.requester, r.addressee])])];
  },
  /** Feed des amis : mes captures et celles de mes amis seulement (pas celles partagées avec tout le monde). */
  async feed(before) {
    const filter = before ? `&created_at=lt.${Supa.enc(iso(before))}` : "";
    const ids = await Cloud.friendIds();
    const list = (await Supa.select(`catches?select=${CATCH_SELECT}&user_id=in.(${ids.join(",")})&order=created_at.desc&limit=30${filter}`)).map(catchFrom);
    if (list.length) {
      const liked = await Supa.select(`likes?select=catch_id&user_id=eq.${me()}&catch_id=in.(${list.map((c) => c.id).join(",")})`);
      const set = new Set(liked.map((l) => l.catch_id));
      list.forEach((c) => { c.likedByMe = set.has(c.id); });
    }
    return list;
  },
  /** Feed 🌍 Monde : publications des joueurs qui les partagent avec tout le monde (30 par page). */
  async worldFeed(before) {
    const rows = await Supa.rpc("world_feed", { p_before: before ? iso(before) : null });
    return (Array.isArray(rows) ? rows : []).map(catchFrom);
  },
  /**
   * Signale une publication (voir report.js) : fonction serveur report-catch (qui efface aussi la photo des
   * publications supprimées), sinon directement la fonction de la base si le serveur ne répond pas.
   */
  async reportCatch(id, reason) {
    try { return await Supa.reportCatch(id, reason); }
    catch (e) {
      if (e.status === 404 || e.status >= 500) return Supa.rpc("report_catch", { p_catch_id: id, p_reason: reason });
      throw e;
    }
  },
  /** Mes publications supprimées après 5 signalements (les plus récentes d'abord). */
  myRemovals: () => Supa.select("catch_removals?select=id,model,type,registration,xp,reasons,removed_at&order=removed_at.desc&limit=20"),
  /** Mon choix pour le feed Monde (true : publications visibles par tout le monde). */
  setShareWorld: (on) => Supa.rpc("set_share_world", { p_on: !!on }),
  /** Résultats du Quiz du jour de mes amis (et les miens), entre deux dates de publication (ms). */
  async dailyResults({ before = null, since = null } = {}) {
    const f = (before ? `&created_at=lt.${Supa.enc(iso(before))}` : "") + (since ? `&created_at=gte.${Supa.enc(iso(since))}` : "");
    const list = (await Supa.select(`daily_results?select=*,profiles!daily_results_user_id_fkey(${PROFILE_SEL}),daily_likes(count)&order=created_at.desc&limit=100${f}`))
      .map((o) => ({ kind: "daily", id: o.id, userId: o.user_id, user: profileFrom(o.profiles), day: o.day, correct: o.correct | 0, total: o.total | 0,
        points: o.points | 0, createdAt: Date.parse(o.created_at) || 0, likeCount: o.daily_likes?.[0]?.count || 0, likedByMe: false }));
    if (list.length) {
      const liked = await Supa.select(`daily_likes?select=result_id&user_id=eq.${me()}&result_id=in.(${list.map((r) => r.id).join(",")})`);
      const set = new Set(liked.map((l) => l.result_id));
      list.forEach((r) => { r.likedByMe = set.has(r.id); });
    }
    return list;
  },
  likeDaily: (id) => Supa.insert("daily_likes", { result_id: id }),
  unlikeDaily: (id) => Supa.delete(`daily_likes?result_id=eq.${id}&user_id=eq.${me()}`),
  like: (id) => Supa.insert("likes", { catch_id: id }),
  unlike: (id) => Supa.delete(`likes?catch_id=eq.${id}&user_id=eq.${me()}`),
  async likers(id) {
    return (await Supa.select(`likes?catch_id=eq.${id}&select=profiles!likes_user_id_fkey(${PROFILE_SEL})`)).map((l) => profileFrom(l.profiles)).filter(Boolean);
  },
  async comments(id) {
    return (await Supa.select(`comments?catch_id=eq.${id}&select=*,profiles!comments_user_id_fkey(${PROFILE_SEL})&order=created_at.asc`))
      .map((o) => ({ id: o.id, userId: o.user_id, user: profileFrom(o.profiles), body: o.body, createdAt: Date.parse(o.created_at) || 0 }));
  },
  async addComment(id, body) {
    if (MyStatus.suspended) throw new ApiError(403, t("Ton compte est suspendu : tu ne peux pas commenter pour l'instant."));
    return Supa.insert("comments", { catch_id: id, body: body.trim() });
  },
  deleteComment: (id) => Supa.delete(`comments?id=eq.${id}`),

  async leaderboard(limit = 100) { return (await Supa.select(`profiles?select=*&order=xp.desc,created_at.asc&limit=${limit}`)).map(profileFrom); },
  async rankOf(xp) { return (await Supa.select(`profiles?select=id&xp=gt.${xp}&limit=10000`)).length + 1; },
  async playerCount() { return (await Supa.select("profiles?select=id&limit=10000")).length; },

  async friendships() {
    const a = await Supa.select(`friendships?select=status,req:profiles!friendships_requester_fkey(${PROFILE_SEL}),add:profiles!friendships_addressee_fkey(${PROFILE_SEL})`);
    return a.map((o) => ({ requester: profileFrom(o.req), addressee: profileFrom(o.add), accepted: o.status === "accepted" }))
      .filter((f) => f.requester && f.addressee);
  },
  async searchUsers(query) {
    const q = query.trim().replace(/[*,()%]/g, "");
    if (q.length < 2) return [];
    return (await Supa.select(`profiles?select=*&username=ilike.${Supa.enc(`*${q}*`)}&id=neq.${me()}&order=xp.desc&limit=20`)).map(profileFrom);
  },
  async addFriend(otherId) {
    const incoming = await Supa.select(`friendships?requester=eq.${otherId}&addressee=eq.${me()}&select=status`);
    if (incoming.length) await Cloud.accept(otherId);
    else await Supa.insert("friendships", { requester: me(), addressee: otherId });
  },
  accept: (requesterId) => Supa.rpc("accept_friend", { p_requester: requesterId }),
  removeFriend(otherId) {
    const m = me();
    return Supa.delete(`friendships?or=(and(requester.eq.${m},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${m}))`);
  },
};

// ---------- Mon état : administrateur ? compte suspendu ? ----------
/**
 * Lu sur le serveur (RPC my_status) à chaque synchronisation, gardé sur le téléphone par compte pour afficher tout de
 * suite l'onglet Admin. Le serveur vérifie lui-même chaque action : ceci ne sert qu'à l'affichage.
 */
export const MyStatus = {
  admin: false, suspended: false, until: null, reason: "",
  load() {
    const s = Supa.userId ? ls.get("my_status:" + Supa.userId, null) : null;
    Object.assign(MyStatus, { admin: !!s?.admin, suspended: !!s?.suspended && (!s.until || Date.parse(s.until) > Date.now()),
      until: s?.until || null, reason: s?.reason || "" });
    return MyStatus;
  },
  async refresh() {
    if (!Supa.userId) { MyStatus.load(); return MyStatus; }
    const s = await Supa.rpc("my_status", {});
    if (s && typeof s === "object") { ls.set("my_status:" + Supa.userId, s); MyStatus.load(); }
    return MyStatus;
  },
};
MyStatus.load();

// ---------- Console d'administration (Profil › Admin, screens/admin.js) ----------
// Lectures et modifications : fonctions admin_* de la base ; suppressions : fonction serveur « admin ».
// Toutes refusent un joueur qui n'est pas administrateur (supabase/admin.sql).
const rpcList = async (name, args = {}) => { const r = await Supa.rpc(name, args); return Array.isArray(r) ? r : []; };
export const Admin = {
  overview: () => Supa.rpc("admin_overview", {}),
  resources: () => Supa.rpc("admin_resources", {}),
  serverStats: () => Supa.admin({ action: "server_stats" }),
  analytics: () => Supa.admin({ action: "ga_report" }),
  apiUsage: (days = 30) => rpcList("admin_api_usage", { p_days: days }),
  players: (query, sort, offset = 0) => rpcList("admin_players", { p_query: query || null, p_sort: sort, p_limit: 50, p_offset: offset }),
  player: (id) => Supa.rpc("admin_player", { p_user: id }),
  setXp: (id, points, mode, reason) => Supa.rpc("admin_set_xp", { p_user: id, p_points: points, p_mode: mode, p_reason: reason || null }),
  rename: (id, name) => Supa.rpc("admin_rename", { p_user: id, p_username: name }),
  unsuspend: (id) => Supa.rpc("admin_unsuspend", { p_user: id }),
  reports: () => rpcList("admin_reports"),
  removals: () => rpcList("admin_removals", { p_limit: 50 }),
  quizFlags: () => Supa.select("quiz_photo_flags?select=*&order=last_at.desc&limit=200"),
  quizPhoto: (photo, action) => Supa.rpc("admin_quiz_photo", { p_photo: photo, p_action: action }),
  aiFlags: () => rpcList("admin_ai_flags"),
  aiRemove: (article, qid) => Supa.rpc("admin_ai_remove", { p_article: article, p_qid: qid }),
  messages: () => rpcList("admin_messages", { p_limit: 200 }),
  catches: ({ before = null, userId = null, id = null, limit = 30 } = {}) =>
    rpcList("admin_catches", { p_before: before ? iso(before) : null, p_user: userId, p_id: id, p_limit: limit }),
  comments: ({ before = null, userId = null, catchId = null, limit = 50 } = {}) =>
    rpcList("admin_comments", { p_before: before ? iso(before) : null, p_user: userId, p_catch: catchId, p_limit: limit }),
  // Suppressions (fonction serveur admin)
  deleteCatch: (id, reason) => Supa.admin({ action: "delete_catch", catch_id: id, reason }),
  dismissReports: (id) => Supa.admin({ action: "dismiss_reports", catch_id: id }),
  deleteComment: (id) => Supa.admin({ action: "delete_comment", id: Number(id) }),
  deleteMessage: (id) => Supa.admin({ action: "delete_message", id: Number(id) }),
  aiKeep: (article, qid) => Supa.admin({ action: "ai_keep", article, qid }),
  suspend: (id, days, reason) => Supa.admin({ action: "suspend", user_id: id, days: days || null, reason: reason || "" }),
  clearAvatar: (id) => Supa.admin({ action: "clear_avatar", user_id: id }),
  deleteAccount: (id) => Supa.admin({ action: "delete_account", user_id: id }),
};

// ---------- Concours de la semaine (photo de la semaine) ----------
export const Weekly = {
  /** Semaine en cours : photos classées, ma participation, dernier gagnant (clôt aussi les semaines terminées). */
  state: () => Supa.rpc("weekly_state", {}),
  submit: (catchId) => Supa.rpc("weekly_submit", { p_catch_id: catchId }),
  withdraw: () => Supa.rpc("weekly_withdraw", {}),
  vote: (entryId, on = true) => Supa.rpc("weekly_vote", { p_entry_id: entryId, p_on: on }),
  /** Photos gagnantes des semaines passées, la plus récente d'abord (avec le pseudo et l'avatar de l'auteur). */
  winners: (limit = 60) => Supa.select(`weekly_winners?select=week,user_id,catch_id,photo_path,model,type,rarity,votes,profiles(username,avatar_path,xp)&order=week.desc&limit=${limit}`),
};

export const otherOf = (f, meId) => (f.requester.id === meId ? f.addressee : f.requester);
export const isIncoming = (f, meId) => !f.accepted && f.addressee.id === meId;

// ---------- Synchronisation (collection + quiz) ----------
let syncing = null;
/** Renvoie null si tout va bien, sinon un message d'erreur. */
export function sync() {
  const u = Supa.userId;
  if (!u) return Promise.resolve(null);
  syncing ||= (async () => {
    try {
      Collection.claimOrphans(u);
      await MyStatus.refresh().catch(() => {}); // administrateur ? suspendu ?
      // Compte suspendu : les photos restent sur le téléphone (le serveur les refuserait), envoyées après la suspension
      if (!MyStatus.suspended) for (const e of Collection.pending(u)) {
        const blob = await Photos.get(e.photoId);
        if (!blob) continue;
        Collection.markSynced(e.id, await Cloud.uploadCatch(e, blob));
      }
      // Photos remplacées (même avion re-photographié) : on envoie la nouvelle version
      if (!MyStatus.suspended) for (const e of Collection.photoPending(u)) {
        const blob = await Photos.get(e.photoId);
        if (!blob) { Collection.update(e.id, { photoPending: false }); continue; }
        const path = await Cloud.replaceCatchPhoto(e.remoteId, blob, e.takenAt);
        Collection.update(e.id, { remotePhoto: path, photoPending: false });
      }
      // Albums modifiés (photos du même avion ajoutées, retirées, nouvelle photo principale)
      if (!MyStatus.suspended) for (const e of Collection.albumPending(u)) {
        try {
          const items = entryPhotoItems(e);
          for (const it of items) {
            if (it.remotePhoto || !it.photoId) continue;
            const blob = await Photos.get(it.photoId);
            if (blob) { it.remotePhoto = await Cloud.uploadPhoto(blob); Collection.update(e.id, { album: items.slice(1), remotePhoto: items[0].remotePhoto }); }
          }
          const sent = items.filter((it) => it.remotePhoto);
          if (sent.length) { await Cloud.setCatchPhotos(e.remoteId, sent.map((it) => it.remotePhoto)); albumSynced(e.id, sent); }
        } catch (err) { console.warn("Album non envoyé", err); } // réessayé à la prochaine synchronisation
      }
      Collection.mergeRemote(u, await Cloud.myCatches());
      await QuizStore.sync(u);
      await postDailyResult(u);
      Player.profile = await Cloud.profile().catch(() => Player.profile);
      window.dispatchEvent(new Event("planego-synced")); // ex. : rappel du quiz du jour (rayon selon le grade)
      return null;
    } catch (e) {
      return navigator.onLine ? e.message || "erreur" : "pas de connexion internet";
    } finally { syncing = null; }
  })();
  return syncing;
}

/**
 * Quiz du jour terminé sur ce téléphone : publie le résultat dans le feed des amis (une fois).
 * Lit directement la partie enregistrée par daily.js (clé « daily_quiz »), après l'envoi des XP du quiz.
 */
async function postDailyResult(u) {
  const st = ls.get("daily_quiz", null);
  if (!st?.done || st.posted || st.other || st.owner !== u || !st.hexes?.length) return;
  try { await Supa.rpc("daily_result_post", { p_day: st.date, p_total: st.hexes.length }); }
  catch (e) { if (!/date invalide/.test(e.message || "")) return; } // trop ancien : on n'insiste pas ; sinon on réessaiera
  const now = ls.get("daily_quiz", null);
  if (now?.date === st.date && now.owner === u) ls.set("daily_quiz", { ...now, posted: true });
}

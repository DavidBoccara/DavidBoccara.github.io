// Client Supabase minimal (comptes, base, stockage), sans dépendance externe.
import { SUPABASE_URL, SUPABASE_KEY, SITE_URL } from "./config.js";
import { ls } from "./util.js";

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let session = ls.get("sb_session");
const listeners = new Set();

/**
 * Lien reçu par e-mail (mot de passe oublié, confirmation du compte) : le serveur ramène sur le site avec
 * « #access_token=…&type=recovery » (ou « #error=… » si le lien a expiré). Lu au chargement, puis effacé de
 * l'adresse pour ne pas laisser le jeton visible. null si l'adresse n'en contient pas.
 */
export const emailLink = (() => {
  try {
    const hash = new URLSearchParams(location.hash.slice(1)), query = new URLSearchParams(location.search);
    const p = hash.get("access_token") || hash.get("error") || hash.get("error_description") ? hash
      : query.get("error") || query.get("error_description") ? query : null;
    if (!p) return null;
    history.replaceState(null, "", location.pathname);
    if (!p.get("access_token")) return { error: p.get("error_description") || p.get("error") || "Lien invalide", code: p.get("error_code") || "" };
    return { type: p.get("type") || "", access_token: p.get("access_token"), refresh_token: p.get("refresh_token") || "",
      expires_in: +p.get("expires_in") || 3600, expires_at: +p.get("expires_at") || 0 };
  } catch { return null; }
})();
const redirect = "?redirect_to=" + encodeURIComponent(SITE_URL);

export const Supa = {
  get isLoggedIn() { return !!session; },
  get userId() { return session?.userId || null; },
  get email() { return session?.email || ""; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  async signUp(email, password, username) {
    const res = await call("POST", "/auth/v1/signup" + redirect,
      { email: email.trim(), password, data: { username: username.trim() } }, { auth: false });
    if (res.access_token) { save(parse(res)); return true; }
    return false; // confirmation par e-mail demandée
  },
  async signIn(email, password) {
    save(parse(await call("POST", "/auth/v1/token?grant_type=password",
      { email: email.trim(), password }, { auth: false })));
  },
  async resetPassword(email) {
    await call("POST", "/auth/v1/recover" + redirect, { email: email.trim() }, { auth: false });
  },
  /** Ouvre la session donnée par un lien d'e-mail ; renvoie son type (« recovery », « signup »…). */
  async useEmailLink(l) {
    const user = await call("GET", "/auth/v1/user", undefined, { auth: false, headers: { Authorization: "Bearer " + l.access_token } });
    save(parse({ ...l, user }));
    return l.type;
  },
  /** Nouveau mot de passe du joueur connecté (après un lien « mot de passe oublié »). */
  updatePassword: (password) => call("PUT", "/auth/v1/user", { password }),
  async signOut() {
    try { await call("POST", "/auth/v1/logout", {}); } catch { /* déjà expirée */ }
    save(null);
  },

  select: (q) => call("GET", "/rest/v1/" + q),
  insert: async (table, row) =>
    (await call("POST", "/rest/v1/" + table, row, { headers: { Prefer: "return=representation" } }))[0],
  delete: (q) => call("DELETE", "/rest/v1/" + q),
  rpc: (name, args) => call("POST", "/rest/v1/rpc/" + name, args),
  enc: encodeURIComponent,

  async upload(bucket, path, blob) {
    await call("POST", `/storage/v1/object/${bucket}/${path}`, blob,
      { contentType: blob.type || "image/jpeg", headers: { "cache-control": "31536000" } });
  },
  async removeFile(bucket, path) {
    try { await call("DELETE", `/storage/v1/object/${bucket}/${path}`); } catch { /* déjà supprimée */ }
  },
  publicUrl: (bucket, path) => `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`,

  /** Suppression définitive du compte connecté (fonction serveur delete-account, avec le jeton du joueur). */
  deleteAccount: () => call("POST", "/functions/v1/delete-account", {}),
  /** Signalement d'une publication (fonction serveur report-catch, avec le jeton du joueur). */
  reportCatch: (catchId, reason) => call("POST", "/functions/v1/report-catch", { catch_id: catchId, reason }),
  /** Questions bonus d'un avion écrites par l'IA d'après son article Wikipédia (fonction serveur ai-questions). */
  aiQuestions: (lang, title, qlang = "fr") => call("POST", "/functions/v1/ai-questions", { lang, title, qlang }),

  /** Appel d'une fonction serveur (relais ADS-B). */
  async fn(name, query) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}?${query}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(r.status, body.error ? `${body.error}${body.details ? " (" + body.details.join(" ; ") + ")" : ""}` : `Erreur ${r.status}`);
    return body;
  },
};

function parse(o) {
  const exp = o.expires_at || Math.floor(Date.now() / 1000) + (o.expires_in || 3600);
  return { accessToken: o.access_token, refreshToken: o.refresh_token, expiresAt: exp, userId: o.user.id, email: o.user.email || "" };
}

function save(s) {
  const changed = (session?.userId || null) !== (s?.userId || null);
  session = s;
  if (s) ls.set("sb_session", s); else ls.del("sb_session");
  if (changed) listeners.forEach((fn) => fn());
}

let refreshing = null;
async function validToken() {
  if (!session) return null;
  if (session.expiresAt - Date.now() / 1000 > 60) return session.accessToken;
  refreshing ||= (async () => {
    try {
      const res = await call("POST", "/auth/v1/token?grant_type=refresh_token",
        { refresh_token: session.refreshToken }, { auth: false });
      save(parse(res));
      return session.accessToken;
    } catch (e) {
      if (e.status >= 400 && e.status < 500) save(null); // session révoquée
      throw new ApiError(401, "Session expirée, reconnectez-vous");
    } finally { refreshing = null; }
  })();
  return refreshing;
}

async function call(method, path, body, { auth = true, headers = {}, contentType = "application/json" } = {}) {
  const token = auth ? await validToken() : null;
  const init = {
    method,
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + (token || SUPABASE_KEY), Accept: "application/json", ...headers },
  };
  if (body !== undefined && body !== null) {
    init.headers["Content-Type"] = contentType;
    init.body = body instanceof Blob ? body : JSON.stringify(body);
  }
  let r;
  try { r = await fetch(SUPABASE_URL + path, init); }
  catch { throw new ApiError(0, navigator.onLine ? "Serveur injoignable" : "Pas de connexion internet"); }
  const text = await r.text();
  if (!r.ok) throw new ApiError(r.status, explain(r.status, text));
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function explain(code, body) {
  let o = null;
  try { o = JSON.parse(body); } catch { /* texte brut */ }
  const raw = ["msg", "message", "error_description", "error"].map((k) => o?.[k]).find((v) => typeof v === "string" && v) || `Erreur ${code}`;
  const pg = o?.code || "";
  const has = (s) => raw.toLowerCase().includes(s.toLowerCase());
  if (has("Invalid login credentials")) return "E-mail ou mot de passe incorrect";
  if (has("should be different")) return "Le nouveau mot de passe doit être différent de l'ancien";
  if (has("session missing") || has("invalid JWT") || has("token is expired")) return "Ce lien n'est plus valable : redemande un e-mail avec « Mot de passe oublié ? »";
  if (has("weak") || has("pwned") || has("known to be")) return "Ce mot de passe est trop facile à deviner : choisis-en un autre";
  if (has("already registered")) return "Un compte existe déjà avec cet e-mail";
  if (has("Password should be")) return "Mot de passe trop court (6 caractères minimum)";
  if (has("Email not confirmed")) return "Confirmez d'abord votre e-mail (lien reçu par mail)";
  if (has("valid email") || has("invalid format")) return "Adresse e-mail invalide";
  if (pg === "23505" && has("username")) return "Ce pseudo est déjà pris";
  if (pg === "23505") return "Déjà fait";
  if (pg === "23514" && has("username")) return "Le pseudo doit faire de 3 à 20 caractères";
  if (code === 429) return "Trop de tentatives, réessayez dans quelques minutes";
  if (code >= 500) return "Serveur momentanément indisponible";
  return raw;
}

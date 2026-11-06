// Questions bonus du quiz (en direct, du jour et Entraînement, à partir du grade 4) : une fois l'avion reconnu, quelques questions sur son modèle,
// tirées de sa page Wikipédia — plus précisément des données de l'article (fiche Wikidata reliée à la page) : pays
// d'origine, premier vol, mise en service, exemplaires construits, envergure, longueur, moteur, constructeur.
// 1 question au grade 4, 2 au grade 5, 3 au grade 6… (Quiz.bonusCount). Les faits d'un modèle sont gardés 30 jours.
// En priorité : questions écrites par une IA (OpenAI) d'après le texte de l'article, préparées une fois par article par
// la fonction serveur ai-questions et gardées sur Supabase (table quiz_ai_questions) ; complétées par les questions
// tirées de la fiche Wikidata si l'IA n'en a pas (assez) ou ne répond pas à temps.
import { LOCALE, LANG } from "./i18n.js";
import { ls, sleep } from "./util.js";
import { Supa } from "./supa.js";
import { CATALOG } from "./game.js";
import { Wiki } from "./net.js";

const CACHE_KEY = "wikifacts_v1" + (LANG === "en" ? "_en" : ""), TTL = 30 * 86400e3;
const enc = encodeURIComponent;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const firstWord = (s) => norm(s).split(" ")[0] || "";
const MONTHS = LANG === "en" ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] : ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

async function getJson(url, ms = 8000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}

// ---------- Faits du modèle (Wikidata reliée à l'article Wikipédia) ----------
const UNIT_TO_M = { Q11573: 1, Q3710: 0.3048, Q174728: 0.01, Q218593: 0.0254 }; // mètre, pied, centimètre, pouce

/** Article Wikipédia du modèle : celui du catalogue (en français) si l'avion y est, sinon celui trouvé par Wiki.find. */
async function articleOf(q) {
  const c = q.type && CATALOG.find((x) => x.codes.includes(q.type) && !x.militaryOnly);
  if (c) return { lang: "fr", title: c.wiki };
  const s = q.wiki ? await Wiki.find(q.wiki).catch(() => null) : null;
  return s && !s.searchOnly ? { lang: s.lang || "fr", title: s.title } : null;
}

/** Valeurs d'une propriété Wikidata (rang « préféré » d'abord, valeurs « dépréciées » écartées). */
function values(claims, p) {
  const list = (claims?.[p] || []).filter((c) => c.rank !== "deprecated" && c.mainsnak?.snaktype === "value" && c.mainsnak.datavalue);
  const pref = list.filter((c) => c.rank === "preferred");
  return (pref.length ? pref : list).map((c) => c.mainsnak.datavalue.value);
}
const timeOf = (v) => {
  const m = /^[+]?(\d{4})-(\d{2})-(\d{2})/.exec(v?.time || "");
  return m && v.precision >= 9 ? { y: +m[1], m: +m[2], d: +m[3], precision: v.precision } : null;
};
const metresOf = (v) => {
  const f = UNIT_TO_M[(v?.unit || "").split("/").pop()], n = parseFloat(v?.amount);
  return f && Number.isFinite(n) ? n * f : null;
};

/** Faits utiles du modèle de la question q, ou null (pas d'article, pas de fiche, hors ligne). */
export async function modelFacts(q) {
  const key = `${q.type || ""}|${q.answer}`;
  const cache = ls.get(CACHE_KEY, {});
  if (cache[key] && Date.now() - cache[key].at < TTL) return cache[key].f;
  const art = await articleOf(q);
  if (!art) return null;
  const pp = await getJson(`https://${art.lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=${enc(art.title)}`);
  const page = Object.values(pp?.query?.pages || {})[0];
  const qid = page?.pageprops?.wikibase_item;
  if (!qid) return null;
  const ent = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=claims&ids=${qid}`);
  const claims = ent?.entities?.[qid]?.claims;
  if (!claims) return null;
  const ids = (p) => values(claims, p).map((v) => v.id).filter(Boolean);
  const refs = { countries: ids("P495"), engines: ids("P516"), makers: ids("P176") };
  const all = [...new Set([...refs.countries, ...refs.engines, ...refs.makers])].slice(0, 45);
  const labels = {};
  if (all.length) {
    const lj = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=labels&languages=${LANG === "en" ? "en|fr" : "fr|en"}&ids=${all.join("|")}`);
    for (const [id, e] of Object.entries(lj?.entities || {})) labels[id] = e.labels?.[LANG]?.value || e.labels?.fr?.value || e.labels?.en?.value || null;
  }
  const named = (list) => [...new Set(list.map((id) => labels[id]).filter(Boolean))];
  const earliest = (p) => values(claims, p).map(timeOf).filter(Boolean).sort((a, b) => a.y - b.y || a.m - b.m || a.d - b.d)[0] || null;
  const metres = (p) => values(claims, p).map(metresOf).find((x) => x != null && x >= 2 && x <= 130) ?? null;
  const built = values(claims, "P1092").map((v) => parseFloat(v.amount)).filter((n) => Number.isFinite(n) && n > 0);
  const f = {
    title: page.title || art.title, lang: art.lang,
    pageUrl: `https://${art.lang}.wikipedia.org/wiki/${enc((page.title || art.title).replace(/ /g, "_"))}`,
    countries: named(refs.countries).map((c) => (/soviétiques/i.test(c) ? "Union soviétique" : c)),
    engines: named(refs.engines), makers: named(refs.makers),
    firstFlight: earliest("P606"), service: earliest("P729"),
    built: built.length ? Math.max(...built) : null,
    wingspan: metres("P2050"), length: metres("P2043"),
  };
  const fresh = ls.get(CACHE_KEY, {});
  fresh[key] = { at: Date.now(), f };
  // On garde les 150 derniers modèles
  const keys = Object.keys(fresh).sort((a, b) => fresh[b].at - fresh[a].at);
  for (const k of keys.slice(150)) delete fresh[k];
  ls.set(CACHE_KEY, fresh);
  return f;
}

// ---------- Fabrication des questions ----------
const COUNTRIES = ["France", "États-Unis", "Royaume-Uni", "Allemagne", "Italie", "Espagne", "Canada", "Brésil", "Russie", "Chine",
  "Japon", "Suède", "Suisse", "Ukraine", "Pays-Bas", "Israël", "Inde", "Pologne", "Tchéquie", "Corée du Sud", "Turquie", "Australie",
  "Union soviétique", "Indonésie", "Autriche", "Argentine"];
const ENGINES = ["CFM International CFM56", "CFM International LEAP", "Pratt & Whitney PW1000G", "IAE V2500", "Rolls-Royce Trent 700",
  "Rolls-Royce Trent XWB", "Rolls-Royce Trent 1000", "General Electric GE90", "General Electric GEnx", "General Electric CF6",
  "General Electric CF34", "Rolls-Royce RB211", "Pratt & Whitney JT8D", "Pratt & Whitney Canada PW100", "Pratt & Whitney Canada PT6",
  "Safran Arriel", "Safran Makila", "Rolls-Royce BR700", "Honeywell TFE731", "Williams FJ44", "Lycoming O-360", "Continental O-200",
  "Snecma M88", "General Electric F404", "Pratt & Whitney F100", "Europrop TP400", "Rolls-Royce AE 2100", "Turbomeca Arrius"];

const fmtDate = (t) => (t.precision >= 11 ? (LANG === "en" ? `${MONTHS[t.m - 1]} ${t.d}, ${t.y}` : `${t.d === 1 ? "1er" : t.d} ${MONTHS[t.m - 1]} ${t.y}`) : t.precision === 10 ? `${MONTHS[t.m - 1]} ${t.y}` : String(t.y));
const fmtMetres = (m) => `${m < 20 ? String(Math.round(m * 10) / 10).replace(".", ",") : Math.round(m)} m`; // 6,5 m · 13 m · 36 m
const nice = (n) => { const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1); return Math.max(1, Math.round(n / p) * p); };
const fmtCount = (n) => nice(n).toLocaleString(LOCALE);

/** Trois mauvaises réponses chiffrées, bien distinctes de la bonne (au moins 15 % d'écart) ; null si impossible. */
function numbers(value, fmt, patterns) {
  for (const f of shuffle(patterns)) {
    const opts = [value, ...f.map((k) => value * k)];
    const labels = opts.map(fmt);
    const okGap = opts.slice(1).every((v) => Math.abs(v - value) / value >= 0.15);
    if (okGap && new Set(labels).size === 4) return { answer: labels[0], options: opts.map((v, i) => [v, labels[i]]).sort((a, b) => a[0] - b[0]).map((x) => x[1]) };
  }
  return null;
}
function years(y) {
  const now = new Date().getFullYear();
  const offs = shuffle([-14, -9, -6, -4, 3, 5, 8, 12]).filter((o) => y + o >= 1903 && y + o <= now).slice(0, 3);
  if (offs.length < 3) return null;
  const opts = [y, ...offs.map((o) => y + o)].sort((a, b) => a - b).map(String);
  return { answer: String(y), options: opts };
}
/** Une bonne réponse (au hasard parmi `goods`) et trois intrus du réservoir, qui ne ressemblent à aucune bonne réponse. */
function choices(goods, pool) {
  const good = pick(goods);
  const taken = goods.map(norm), tokens = new Set(goods.flatMap((g) => norm(g).split(" ").filter((w) => w.length >= 4 || /\d/.test(w))));
  const wrong = shuffle(pool.filter((x) => !taken.includes(norm(x)) && !norm(x).split(" ").some((w) => tokens.has(w)))).slice(0, 3);
  return wrong.length === 3 ? { answer: good, options: shuffle([good, ...wrong]) } : null;
}

/** Toutes les questions possibles pour ce modèle (chacune : id, texte, options, réponse, explication). */
function candidates(f, q) {
  const out = [], src = "Selon Wikipédia";
  const add = (id, text, c, explain) => { if (c) out.push({ id, text, options: c.options, answer: c.answer, explain: `${src} : ${explain}` }); };
  if (f.countries.length) {
    const multi = f.countries.length > 1;
    add("pays", multi ? "Lequel de ces pays a participé à sa conception ?" : "De quel pays vient cet avion ?",
      choices(f.countries, COUNTRIES), `pays d'origine : ${f.countries.join(", ")}.`);
  }
  if (f.firstFlight) add("vol", "En quelle année a-t-il volé pour la première fois ?", years(f.firstFlight.y), `premier vol le ${fmtDate(f.firstFlight)}.`);
  if (f.service && (!f.firstFlight || f.service.y !== f.firstFlight.y)) {
    add("service", "En quelle année est-il entré en service ?", years(f.service.y), `entrée en service : ${fmtDate(f.service)}.`);
  }
  if (f.built >= 10) {
    add("construits", "Combien d'exemplaires ont été construits, environ ?",
      numbers(f.built, (n) => `environ ${fmtCount(n)}`, [[0.1, 0.3, 3], [0.3, 3, 10], [0.05, 0.25, 4], [0.2, 4, 12]]),
      `${f.built.toLocaleString(LOCALE)} exemplaires construits.`);
  }
  if (f.wingspan) {
    add("envergure", "Quelle est son envergure (d'un bout d'aile à l'autre) ?",
      numbers(f.wingspan, fmtMetres, [[0.45, 0.7, 1.45], [0.6, 1.35, 1.9], [0.5, 1.4, 2.1], [0.4, 0.65, 1.3]]), `envergure de ${fmtMetres(f.wingspan)}.`);
  }
  if (f.length) {
    add("longueur", "Quelle est sa longueur ?",
      numbers(f.length, fmtMetres, [[0.45, 0.7, 1.45], [0.6, 1.35, 1.9], [0.5, 1.4, 2.1], [0.4, 0.65, 1.3]]), `longueur de ${fmtMetres(f.length)}.`);
  }
  if (f.engines.length) add("moteur", "Quel moteur l'équipe ?", choices(f.engines, ENGINES), `moteur${f.engines.length > 1 ? "s" : ""} : ${f.engines.join(", ")}.`);
  // Constructeur : seulement s'il n'est pas déjà écrit dans le nom de l'avion (sinon la réponse est donnée)
  const answerWords = norm(q.answer).split(" ");
  const makers = f.makers.filter((m) => !answerWords.includes(firstWord(m)));
  if (makers.length === f.makers.length && makers.length) {
    const pool = [...new Set(CATALOG.map((c) => c.maker))].filter((m) => !f.makers.some((x) => firstWord(x) === firstWord(m)));
    add("constructeur", "Quel constructeur le fabrique ?", choices(makers, pool), `constructeur : ${f.makers.join(", ")}.`);
  }
  return out;
}

// ---------- Questions écrites par l'IA (d'après l'article) ----------
const AI_WAIT_MS = 12000, AI_SEEN = "ai_questions_seen";
const aiMem = new Map();
/** Questions IA de l'article du modèle : lues sur le serveur, ou préparées par l'IA la première fois (10 à 40 s). */
function aiRow(q) {
  if (!Supa.isLoggedIn) return Promise.resolve(null);
  const key = `${q.type || ""}|${q.answer}`;
  if (!aiMem.has(key)) aiMem.set(key, (async () => {
    const art = await articleOf(q);
    if (!art) return null;
    // Joueur anglophone : questions écrites en anglais (clé « en-q:… »)
    const id = (LANG === "en" ? "en-q:" : "") + `${art.lang}:${art.title}`;
    const rows = await Supa.select(`quiz_ai_questions?article=eq.${Supa.enc(id)}&select=article,title,page_url,questions`).catch(() => []);
    if (rows?.[0]?.questions?.length) return rows[0];
    const made = await Supa.aiQuestions(art.lang, art.title, LANG).catch(() => null);
    return made?.questions?.length ? made : null;
  })().catch(() => null));
  return aiMem.get(key);
}
/** À appeler dès que la question s'affiche : l'article et les questions sont prêts quand le joueur a répondu. */
export function prefetchBonus(q) {
  aiRow(q);
  modelFacts(q).catch(() => null);
}
const fromAi = (row) => row.questions.map((x) => ({
  id: `ai:${x.id}`, qid: x.id, article: row.article, ai: true, text: x.question,
  options: shuffle(x.options), answer: x.options[x.answer],
  explain: [x.explanation, x.quote && (LANG === "en" ? `Wikipedia: « ${x.quote} »` : `Wikipédia : « ${x.quote} »`)].filter(Boolean).join(" — "),
  pageUrl: row.page_url, title: row.title,
}));

/** Jusqu'à n questions bonus sur le modèle de la question q, dans un ordre varié : celles de l'IA d'abord (pas encore
 * vues de préférence), puis celles de la fiche Wikidata. Moins de n si Wikipédia en sait moins. */
export async function bonusQuestions(q, n) {
  if (!n) return [];
  const row = await Promise.race([aiRow(q), sleep(AI_WAIT_MS).then(() => null)]);
  const seen = new Set(ls.get(AI_SEEN, []));
  const ai = row ? fromAi(row) : [];
  const picked = [...shuffle(ai.filter((x) => !seen.has(x.id))), ...shuffle(ai.filter((x) => seen.has(x.id)))].slice(0, n);
  if (picked.length) ls.set(AI_SEEN, [...ls.get(AI_SEEN, []).filter((id) => !picked.some((p) => p.id === id)), ...picked.map((p) => p.id)].slice(-500));
  if (picked.length < n) {
    const f = await modelFacts(q).catch(() => null);
    if (f) picked.push(...shuffle(candidates(f, q)).slice(0, n - picked.length).map((x) => ({ ...x, pageUrl: f.pageUrl, title: f.title })));
  }
  return picked;
}

/** Signale une question écrite par l'IA (retirée pour tous à 3 joueurs) ; renvoie le nombre de joueurs. */
export const flagAiQuestion = (b) => Supa.rpc("flag_ai_question", { p_article: b.article, p_qid: b.qid });

/** Pour les tests : questions possibles à partir de faits donnés. */
export const _test = { candidates, numbers, years, choices };

// Formulaire « Contactez-nous » de la page publique /contact/ (tools/pages_content.py) :
// enregistre le message dans la table contact_messages de Supabase (écriture seule ; lecture par le propriétaire).
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const form = document.getElementById("contact"), status = document.getElementById("status");
const EN = document.documentElement.lang === "en"; // page /en/contact/
const say = (text, cls) => { status.textContent = text; status.className = "status " + (cls || ""); };
const tr = (fr, en) => (EN ? en : fr);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(form);
  if (f.get("website")) return say(tr("Message envoyé, merci !", "Message sent, thank you!"), "ok"); // robot (champ caché rempli)
  const name = String(f.get("name") || "").trim(), email = String(f.get("email") || "").trim();
  const subject = String(f.get("subject") || "").trim(), message = String(f.get("message") || "").trim();
  if (!name) return say(tr("Indique ton nom ou ton pseudo.", "Please enter your name or nickname."), "err");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say(tr("Cette adresse e-mail ne semble pas valide.", "This email address does not look valid."), "err");
  if (!subject) return say(tr("Choisis un sujet.", "Please choose a subject."), "err");
  if (message.length < 5) return say(tr("Écris ton message.", "Please write your message."), "err");
  const btn = form.querySelector("button");
  btn.disabled = true; say(tr("Envoi…", "Sending…"));
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/contact_messages`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name, email: email || null, subject, message, page: location.hostname }),
    });
    if (!res.ok) throw new Error(String(res.status));
    form.reset();
    say(tr("Message envoyé, merci ! Nous te répondrons si tu as laissé ton adresse e-mail.", "Message sent, thank you! We will reply if you left your email address."), "ok");
  } catch {
    say(tr("L'envoi n'a pas marché. Réessaie dans quelques minutes.", "Sending failed. Please try again in a few minutes."), "err");
  } finally {
    btn.disabled = false;
  }
});

// Formulaire « Contactez-nous » de la page publique /contact/ (tools/pages_content.py) :
// enregistre le message dans la table contact_messages de Supabase (écriture seule ; lecture par le propriétaire).
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const form = document.getElementById("contact"), status = document.getElementById("status");
const say = (text, cls) => { status.textContent = text; status.className = "status " + (cls || ""); };

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(form);
  if (f.get("website")) return say("Message envoyé, merci !", "ok"); // robot (champ caché rempli)
  const name = String(f.get("name") || "").trim(), email = String(f.get("email") || "").trim();
  const subject = String(f.get("subject") || "").trim(), message = String(f.get("message") || "").trim();
  if (!name) return say("Indique ton nom ou ton pseudo.", "err");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say("Cette adresse e-mail ne semble pas valide.", "err");
  if (!subject) return say("Choisis un sujet.", "err");
  if (message.length < 5) return say("Écris ton message.", "err");
  const btn = form.querySelector("button");
  btn.disabled = true; say("Envoi…");
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/contact_messages`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name, email: email || null, subject, message, page: location.hostname }),
    });
    if (!res.ok) throw new Error(String(res.status));
    form.reset();
    say("Message envoyé, merci ! Nous te répondrons si tu as laissé ton adresse e-mail.", "ok");
  } catch {
    say("L'envoi n'a pas marché. Réessaie dans quelques minutes.", "err");
  } finally {
    btn.disabled = false;
  }
});

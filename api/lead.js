// api/lead.js
// Fonction serverless Vercel : reçoit les données du simulateur,
// crée/met à jour le contact dans Brevo, l'ajoute à la liste "Frontaliers - Simulateur",
// envoie l'email transactionnel, et ajoute à la newsletter si opt-in.

// ─── LISTE DE DOMAINES D'EMAILS JETABLES ─────────────────
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "yopmail.com", "yopmail.fr", "yopmail.net",
  "mailinator.com", "mailinator.net", "mailinator.org",
  "tempmail.com", "temp-mail.org", "tempmail.io", "tempmailo.com",
  "10minutemail.com", "10minutemail.net",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "throwawaymail.com", "throwaway.email",
  "maildrop.cc", "dispostable.com",
  "sharklasers.com", "grr.la",
  "getairmail.com", "getnada.com", "nada.email",
  "mytemp.email", "mytrashmail.com",
  "trashmail.com", "trashmail.net", "trashmail.io",
  "mohmal.com", "fakemail.net", "fakeinbox.com",
  "emailondeck.com", "burnermail.io",
  "spamgourmet.com", "spam4.me", "spambox.us",
  "mailcatch.com", "mailnesia.com", "mailnull.com",
  "mintemail.com", "mailexpire.com",
  "discard.email", "discardmail.com",
  "tmpmail.org", "tmpmail.net", "tmpeml.com",
  "wegwerfemail.de", "wegwerfmail.de",
  "spambog.com", "spambog.ru",
  "getmeoff.me", "mytempmail.com",
  "owlymail.com", "inboxkitten.com",
  "mailsac.com", "tempinbox.com",
]);

function isDisposableEmail(email) {
  if (!email || typeof email !== "string") return false;
  const parts = email.toLowerCase().split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1];
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const {
    email,
    prenom,
    nom,
    salaire_brut,
    canton,
    charges_totales,
    reste_a_vivre,
    newsletter_optin,
  } = req.body || {};

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: "invalid_format", message: "Email invalide" });
  }

  if (isDisposableEmail(email)) {
    return res.status(400).json({
      error: "disposable",
      message: "Merci d'utiliser une adresse email personnelle (Gmail, Outlook, etc.). Les emails jetables ne sont pas acceptés.",
    });
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const LIST_ID_SIMULATEUR = 3;
  const LIST_ID_NEWSLETTER = 4;
  const TEMPLATE_ID = 1;

  if (!BREVO_API_KEY) {
    console.error("BREVO_API_KEY manquante dans les env vars Vercel");
    return res.status(500).json({ error: "Configuration serveur invalide" });
  }

  const listIds = [LIST_ID_SIMULATEUR];
  if (newsletter_optin === true) {
    listIds.push(LIST_ID_NEWSLETTER);
  }

  try {
    const contactRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        email,
        attributes: {
          PRENOM: prenom || "",
          NOM: nom || "",
          SALAIRE_BRUT: salaire_brut || "",
          CANTON: canton || "",
          RESTE_A_VIVRE: reste_a_vivre || "",
          NEWSLETTER_OPTIN: newsletter_optin === true ? "Oui" : "Non",
        },
        listIds,
        updateEnabled: true,
      }),
    });

    if (!contactRes.ok && contactRes.status !== 204) {
      const errText = await contactRes.text();
      console.error("Erreur création contact Brevo:", contactRes.status, errText);
    }

    const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        to: [{ email, name: prenom || email }],
        templateId: TEMPLATE_ID,
        params: {
          prenom: prenom || "",
          salaire_brut: salaire_brut || "",
          canton: canton || "",
          charges_totales: charges_totales || "",
          reste_a_vivre: reste_a_vivre || "",
        },
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Erreur envoi email Brevo:", emailRes.status, errText);
      return res.status(500).json({ error: "Erreur lors de l'envoi de l'email" });
    }

    return res.status(200).json({
      success: true,
      message: "Email envoyé avec succès",
    });

  } catch (err) {
    console.error("Erreur serveur:", err);
    return res.status(500).json({ error: "Une erreur est survenue" });
  }
}

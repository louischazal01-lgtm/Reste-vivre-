// api/lead.js
// Fonction serverless Vercel : reçoit les données du simulateur,
// crée/met à jour le contact dans Brevo, l'ajoute à la liste "Frontaliers - Simulateur",
// et envoie l'email transactionnel avec les résultats.

export default async function handler(req, res) {
  // CORS
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
  } = req.body || {};

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: "Email invalide" });
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const LIST_ID = 3;      // Liste "Frontaliers - Simulateur"
  const TEMPLATE_ID = 1;  // Template "Résultat simulation Reste à Vivre"

  if (!BREVO_API_KEY) {
    console.error("BREVO_API_KEY manquante dans les env vars Vercel");
    return res.status(500).json({ error: "Configuration serveur invalide" });
  }

  try {
    // === 1. Créer ou mettre à jour le contact + l'ajouter à la liste ===
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
        },
        listIds: [LIST_ID],
        updateEnabled: true,
      }),
    });

    if (!contactRes.ok && contactRes.status !== 204) {
      const errText = await contactRes.text();
      console.error("Erreur création contact Brevo:", contactRes.status, errText);
    }

    // === 2. Envoyer l'email transactionnel avec les résultats ===
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

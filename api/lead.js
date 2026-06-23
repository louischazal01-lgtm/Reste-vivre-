// api/lead.js
// Fonction serverless Vercel : reçoit les données du simulateur,
// crée/met à jour le contact dans Brevo, l'ajoute à la liste "Frontaliers - Simulateur",
// envoie l'email transactionnel de résultat, et ajoute à la newsletter si opt-in.

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

// Petit utilitaire de formatage EUR pour les params du template
function fmtEUR(n) {
  const v = parseInt(n);
  if (isNaN(v)) return "";
  return new Intl.NumberFormat("fr-FR").format(v);
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
    regime,           // "source" | "france"
    net_mensuel,      // EUR
    sante_type,       // "lamal" | "cmu"
    sante_montant,    // EUR/mois (option choisie)
    lamal,            // EUR/mois
    cmu,              // EUR/mois
    loyer,            // EUR
    transport,        // EUR
    courses,          // EUR
    charges_totales,  // EUR
    reste_a_vivre,    // EUR
    verdict,          // "vert" | "orange" | "rouge"
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
  const RAPH_BRAIN_URL = "https://raphbrain.duckdns.org/api/leads";
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

  // Libellés lisibles pour le template
  const santeLabel = sante_type === "lamal" ? "LAMal (assurance suisse)"
                   : sante_type === "cmu" ? "CMU (assurance française)" : "—";
  const regimeLabel = regime === "source"
    ? "Impôt à la source (prélevé en Suisse)"
    : "Imposition en France (accord de 1983)";
  const verdictLabel = verdict === "rouge" ? "Projet sous tension"
                     : verdict === "orange" ? "Projet à sécuriser"
                     : "Projet solide";
  // Détermine quelle assurance est la moins chère pour le conseil
  const lamalN = parseInt(lamal), cmuN = parseInt(cmu);
  let santeConseil = "";
  if (!isNaN(lamalN) && !isNaN(cmuN)) {
    if (cmuN < lamalN) {
      santeConseil = `Dans ton cas, la CMU est moins chère que la LAMal d'environ ${fmtEUR(lamalN - cmuN)} €/mois, soit ${fmtEUR((lamalN - cmuN) * 12)} €/an.`;
    } else if (lamalN < cmuN) {
      santeConseil = `Dans ton cas, la LAMal est moins chère que la CMU d'environ ${fmtEUR(cmuN - lamalN)} €/mois, soit ${fmtEUR((cmuN - lamalN) * 12)} €/an.`;
    } else {
      santeConseil = "Dans ton cas, LAMal et CMU sont à un niveau comparable.";
    }
  }

  // Sync Raph Brain DB (non-bloquant)
  fetch(RAPH_BRAIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email, prenom, nom,
      salaire_brut: parseInt(salaire_brut) || null,
      canton,
      regime: regime || null,
      net_mensuel: parseInt(net_mensuel) || null,
      sante_type: sante_type || null,
      sante_montant: parseInt(sante_montant) || null,
      charges_totales: parseInt(charges_totales) || null,
      reste_a_vivre: parseInt(reste_a_vivre) || null,
      verdict: verdict || null,
      newsletter_optin: newsletter_optin === true,
      source: "simulateur",
    }),
  }).catch(() => {});

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
          salaire_brut: fmtEUR(salaire_brut),
          canton: canton || "",
          regime_label: regimeLabel,
          net_mensuel: fmtEUR(net_mensuel),
          sante_label: santeLabel,
          sante_montant: fmtEUR(sante_montant),
          lamal: fmtEUR(lamal),
          cmu: fmtEUR(cmu),
          sante_conseil: santeConseil,
          loyer: fmtEUR(loyer),
          transport: fmtEUR(transport),
          courses: fmtEUR(courses),
          charges_totales: fmtEUR(charges_totales),
          reste_a_vivre: fmtEUR(reste_a_vivre),
          verdict_label: verdictLabel,
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

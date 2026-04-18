import { useState, useEffect, useRef } from "react";

// ─── DATA 2026 ───────────────────────────────────────────

const CANTONS = [
  { id: "geneve", label: "Genève", smicHoraire: 24.59 },
  { id: "vaud", label: "Vaud", smicHoraire: 0 },
  { id: "bale", label: "Bâle-Ville", smicHoraire: 22.20 },
  { id: "neuchatel", label: "Neuchâtel", smicHoraire: 21.40 },
  { id: "jura", label: "Jura", smicHoraire: 21.40 },
];

const SITUATIONS = [
  { id: "celibataire", label: "Célibataire", icon: "👤", bareme: "A" },
  { id: "marie", label: "Marié(e) — 1 revenu", icon: "👫", bareme: "B" },
  { id: "marie2", label: "Marié(e) — 2 revenus", icon: "👥", bareme: "C" },
];

const ENFANTS_OPTS = [
  { id: 0, label: "0" }, { id: 1, label: "1" },
  { id: 2, label: "2" }, { id: 3, label: "3+" },
];

// ─── LISTE EMAILS JETABLES (validation côté client) ─────
const DISPOSABLE_DOMAINS = [
  "yopmail.com", "yopmail.fr", "mailinator.com", "tempmail.com",
  "10minutemail.com", "guerrillamail.com", "throwawaymail.com",
  "maildrop.cc", "sharklasers.com", "getnada.com", "trashmail.com",
  "fakemail.net", "fakeinbox.com", "discard.email", "tempmail.io",
  "temp-mail.org", "dispostable.com", "mohmal.com", "mailsac.com",
  "inboxkitten.com",
];

function isDisposableEmail(email) {
  if (!email) return false;
  const domain = email.toLowerCase().split("@")[1];
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.some(d => domain === d || domain.endsWith("." + d));
}

// ─── CALCULATION ENGINE (2026 DATA) ─────────────────────

function getLPPRate(age) {
  if (age < 25) return 0;
  if (age < 35) return 0.035;
  if (age < 45) return 0.05;
  if (age < 55) return 0.075;
  return 0.09;
}

function computeImpotSource(brutAnnuel, canton, situation, enfants) {
  const mensuel = brutAnnuel / 12;
  let tauxEffectif = 0;
  let regime = "source";
  let noteFiscale = "";

  if (canton === "geneve") {
    const baremeA0 = [
      { max: 1799, taux: 0 },
      { max: 3633, taux: 0.04 },
      { max: 4166, taux: 0.06 },
      { max: 5416, taux: 0.08 },
      { max: 6250, taux: 0.10 },
      { max: 7083, taux: 0.11 },
      { max: 7916, taux: 0.12 },
      { max: 9583, taux: 0.13 },
      { max: 11250, taux: 0.15 },
      { max: 12500, taux: 0.165 },
      { max: 14583, taux: 0.165 },
      { max: 16666, taux: 0.175 },
      { max: 20833, taux: 0.19 },
      { max: 25000, taux: 0.21 },
      { max: Infinity, taux: 0.235 },
    ];

    const tranche = baremeA0.find(t => mensuel <= t.max);
    tauxEffectif = tranche ? tranche.taux : 0.235;

    if (situation === "marie") tauxEffectif *= 0.62;
    if (situation === "marie2") tauxEffectif *= 0.80;

    const redEnfants = Math.min(enfants, 3) * 0.015;
    tauxEffectif = Math.max(0, tauxEffectif - redEnfants);

    regime = "source";
    noteFiscale = "À Genève, votre impôt est prélevé directement sur votre salaire chaque mois. Vous ne paierez pas d'impôt supplémentaire en France sur ce salaire (crédit d'impôt), mais vous devez quand même le déclarer.";
  } else if (canton === "bale") {
    tauxEffectif = 0.045;
    regime = "forfaitaire";
    noteFiscale = "À Bâle-Ville, un impôt forfaitaire de 4.5% est prélevé à la source. Vous devrez également déclarer vos revenus en France et payer la différence éventuelle.";
  } else {
    tauxEffectif = 0;
    regime = "france";
    noteFiscale = `À ${CANTONS.find(c => c.id === canton)?.label || canton}, votre impôt à la source est de 0 CHF. C'est normal : vous paierez votre impôt directement en France l'année prochaine. Prévoyez une épargne de sécurité pour cette dépense.`;
  }

  return {
    taux: tauxEffectif,
    montantAnnuel: Math.round(brutAnnuel * tauxEffectif),
    regime,
    noteFiscale,
  };
}

function computeResults(data) {
  const brut = data.salaire || 0;
  const age = data.age || 30;
  const tauxActivite = (data.tauxActivite || 100) / 100;

  const avs = Math.round(brut * 0.053);
  const ac = Math.round(Math.min(brut, 148200) * 0.011);

  const deductionCoord = 26460 * tauxActivite;
  const salaireCoord = Math.max(0, brut - deductionCoord);
  const lppRate = getLPPRate(age);
  const lpp = Math.round(salaireCoord * lppRate);

  const totalCotisations = avs + ac + lpp;
  const netSocial = brut - totalCotisations;

  const impotData = computeImpotSource(brut, data.canton, data.situation, data.enfants || 0);
  const impot = impotData.montantAnnuel;
  const tauxIS = Math.round(impotData.taux * 1000) / 10;

  const netAnnuel = netSocial - impot;
  const netMensuel = Math.round(netAnnuel / 12);

  const lamalMensuel = 200;
  const rfrEstime = netSocial * 0.92 / 1.05;
  const pass2026 = 46368;
  const assietteCMU = Math.max(0, rfrEstime - (pass2026 * 0.5));
  const cmuAnnuel = Math.round(assietteCMU * 0.08);
  const cmuMensuel = Math.round(cmuAnnuel / 12);

  const assurance = data.sante === "lamal" ? lamalMensuel : data.sante === "cmu" ? cmuMensuel : 0;

  const loyer = 880;
  const transportBase = 290;
  const transport = Math.round(transportBase * tauxActivite);
  const coursesBase = 560;
  const courses = Math.round(coursesBase * (0.7 + 0.3 * tauxActivite));
  const totalCharges = loyer + transport + courses + assurance;
  const resteAVivre = netMensuel - totalCharges;

  const netFranceMensuel = Math.round(brut * 0.39 / 12);
  const gainPct = netFranceMensuel > 0 ? Math.round(((netMensuel - netFranceMensuel) / netFranceMensuel) * 100) : 0;

  let teleAlert = "";
  const telePct = (data.teletravail || 0) / 5 * 100;
  if (telePct > 0 && telePct <= 40) {
    teleAlert = "safe";
  } else if (telePct > 40) {
    teleAlert = "danger";
  }

  const cantonObj = CANTONS.find(c => c.id === data.canton);
  const smicHoraire = cantonObj?.smicHoraire || 0;
  const salaireMensuelBrut = brut / 12;
  const heuresMensuelles = 173.33 * tauxActivite;
  const salaireHoraire = heuresMensuelles > 0 ? salaireMensuelBrut / heuresMensuelles : 0;
  const isDumping = smicHoraire > 0 && salaireHoraire < smicHoraire && brut > 0;

  let verdict = "vert";
  let verdictLabel = "Projet solide";
  let verdictMsg = "Votre reste à vivre est confortable pour une installation sereine.";
  if (resteAVivre < 500) {
    verdict = "rouge";
    verdictLabel = "Projet sous haute tension";
    verdictMsg = `Il ne vous reste que ${Math.round(resteAVivre)} CHF de marge. Vos charges fixes (Santé/Loyer) absorbent trop de votre revenu à ce taux d'activité. C'est un risque majeur pour votre équilibre financier.`;
  } else if (resteAVivre < 1500) {
    verdict = "orange";
    verdictLabel = "Vigilance";
    verdictMsg = "Votre projet est viable mais votre marge de sécurité est faible face aux imprévus (santé, voiture, inflation).";
  }

  return {
    brut, avs, ac, lpp, lppRate: Math.round(lppRate * 1000) / 10,
    totalCotisations, netSocial,
    impot, tauxIS, netMensuel,
    regime: impotData.regime, noteFiscale: impotData.noteFiscale,
    lamalMensuel, cmuMensuel, cmuAnnuel,
    assurance, loyer, transport, courses, totalCharges,
    resteAVivre, gainPct, teleAlert, telePct,
    netFranceMensuel, tauxActivite: data.tauxActivite || 100,
    canton: cantonObj?.label || "",
    isDumping, smicHoraire, salaireHoraire: Math.round(salaireHoraire * 100) / 100,
    verdict, verdictLabel, verdictMsg,
  };
}

const fmt = (n) => new Intl.NumberFormat("fr-CH").format(n);

// ─── UI COMPONENTS ───────────────────────────────────────

function Progress({ step, total }) {
  return (
    <div style={{ display: "flex", gap: 5, padding: "0 4px", marginBottom: 36 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          flex: 1, height: 5, borderRadius: 3,
          background: i <= step
            ? "linear-gradient(90deg, #FF6B35, #FFB347)"
            : "rgba(0,0,0,0.06)",
          transition: "background 0.5s ease",
        }} />
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{
        display: "block", fontSize: 13, fontWeight: 700,
        color: "#64748b", marginBottom: 10,
        fontFamily: "var(--fb)", letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, placeholder, suffix }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "16px 18px",
          paddingRight: suffix ? 65 : 18,
          background: "#fff",
          border: "2px solid #e2e8f0",
          borderRadius: 16, color: "#1e293b",
          fontSize: 17, fontWeight: 700,
          fontFamily: "var(--fb)", outline: "none",
          transition: "border-color 0.3s, box-shadow 0.3s",
          boxSizing: "border-box",
        }}
        onFocus={e => {
          e.target.style.borderColor = "#FF6B35";
          e.target.style.boxShadow = "0 0 0 4px rgba(255,107,53,0.1)";
        }}
        onBlur={e => {
          e.target.style.borderColor = "#e2e8f0";
          e.target.style.boxShadow = "none";
        }}
      />
      {suffix && (
        <span style={{
          position: "absolute", right: 18, top: "50%",
          transform: "translateY(-50%)", color: "#94a3b8",
          fontSize: 14, fontWeight: 700, fontFamily: "var(--fb)",
        }}>{suffix}</span>
      )}
    </div>
  );
}

function Chips({ options, value, onChange, columns }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: columns || `repeat(${Math.min(options.length, 3)}, 1fr)`,
      gap: 8,
    }}>
      {options.map(opt => {
        const active = String(value) === String(opt.id);
        return (
          <button key={opt.id} onClick={() => onChange(opt.id)} style={{
            padding: "14px 10px", borderRadius: 14,
            border: active ? "2px solid #FF6B35" : "2px solid #e2e8f0",
            background: active ? "linear-gradient(135deg, #FFF5EE, #FFF0E6)" : "#fff",
            color: active ? "#FF6B35" : "#475569",
            fontSize: 14, fontWeight: 700,
            fontFamily: "var(--fb)", cursor: "pointer",
            transition: "all 0.2s ease",
            display: "flex", flexDirection: "column",
            alignItems: "center", gap: 4,
          }}>
            {opt.icon && <span style={{ fontSize: 20 }}>{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Slider({ value, onChange, min = 0, max = 5 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        style={{ flex: 1 }}
      />
      <div style={{
        minWidth: 72, padding: "10px 14px",
        background: "#fff", borderRadius: 12,
        border: "2px solid #e2e8f0", textAlign: "center",
        fontSize: 16, fontWeight: 800, color: "#1e293b",
        fontFamily: "var(--fb)",
      }}>
        {value}j / sem
      </div>
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary", style: sx }) {
  const isPrimary = variant === "primary";
  return (
    <button onClick={disabled ? null : onClick} style={{
      width: "100%", padding: "18px 24px",
      borderRadius: 16, border: "none",
      fontSize: 17, fontWeight: 800,
      fontFamily: "var(--fh)", cursor: disabled ? "default" : "pointer",
      transition: "all 0.3s ease",
      opacity: disabled ? 0.4 : 1,
      ...(isPrimary ? {
        background: "linear-gradient(135deg, #FF6B35, #FF8F5E)",
        color: "#fff",
        boxShadow: "0 4px 20px rgba(255,107,53,0.35)",
      } : {
        background: "#f1f5f9", color: "#64748b",
      }),
      ...sx,
    }}>
      {children}
    </button>
  );
}

function Card({ label, value, highlight, sub, icon }) {
  return (
    <div style={{
      padding: "18px 20px",
      background: highlight ? "linear-gradient(135deg, #FFF5EE, #FFF9F5)" : "#fff",
      border: highlight ? "2px solid #FF6B35" : "2px solid #f1f5f9",
      borderRadius: 16, marginBottom: 10,
    }}>
      <div style={{
        fontSize: 11, color: "#94a3b8", marginBottom: 6,
        fontFamily: "var(--fb)", textTransform: "uppercase",
        letterSpacing: "0.08em", fontWeight: 700,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        {label}
      </div>
      <div style={{
        fontSize: 26, fontFamily: "var(--fh)",
        fontWeight: 900, color: highlight ? "#FF6B35" : "#1e293b",
      }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, fontWeight: 600, fontFamily: "var(--fb)" }}>{sub}</div>}
    </div>
  );
}

function AlertBox({ type, children }) {
  const colors = type === "danger"
    ? { bg: "#FEF2F2", border: "#FECACA", text: "#DC2626", icon: "🚨" }
    : { bg: "#F0FDF4", border: "#BBF7D0", text: "#16A34A", icon: "✅" };
  return (
    <div style={{
      marginTop: 12, padding: "14px 16px",
      background: colors.bg, border: `2px solid ${colors.border}`,
      borderRadius: 14, fontSize: 14, fontWeight: 700,
      color: colors.text, fontFamily: "var(--fb)",
      display: "flex", alignItems: "flex-start", gap: 10,
      animation: "slideUp 0.4s ease",
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{colors.icon}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── SCREENS ─────────────────────────────────────────────

function Accueil({ onStart }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 100); }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      justifyContent: "center", padding: "40px 24px", textAlign: "center",
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(30px)",
      transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: "#FFF5EE", borderRadius: 50, padding: "8px 18px",
        margin: "0 auto 24px", border: "2px solid #FFE0CC",
      }}>
        <span style={{ fontSize: 14 }}>🇨🇭</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#FF6B35", fontFamily: "var(--fb)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Simulateur 2026
        </span>
      </div>

      <h1 style={{
        fontSize: "clamp(28px, 7vw, 44px)", fontFamily: "var(--fh)",
        fontWeight: 900, color: "#1e293b", lineHeight: 1.15, marginBottom: 18,
      }}>
        Genève vs France :
        <br />
        <span style={{
          background: "linear-gradient(135deg, #FF6B35, #FF8F5E)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Votre vrai pouvoir d'achat ?
        </span>
      </h1>

      <p style={{
        fontSize: 16, color: "#64748b", lineHeight: 1.65,
        maxWidth: 420, margin: "0 auto 36px", fontFamily: "var(--fb)", fontWeight: 500,
      }}>
        Ne vous laissez pas aveugler par le salaire brut. Découvrez votre <strong style={{ color: "#1e293b" }}>« Reste à Vivre »</strong> net après impôts, santé et coût de la vie transfrontalière.
      </p>

      <Btn onClick={onStart}>Lancer mon diagnostic →</Btn>
      <div style={{ marginTop: 12, fontSize: 13, color: "#94a3b8", fontFamily: "var(--fb)", fontWeight: 600 }}>
        Gratuit — 2 minutes
      </div>

      <div style={{
        marginTop: 48, display: "flex", gap: 24,
        justifyContent: "center", flexWrap: "wrap",
      }}>
        {[
          { n: "2 847", l: "diagnostics", icon: "📊" },
          { n: "94%", l: "de précision", icon: "🎯" },
          { n: "Gratuit", l: "100% sans engagement", icon: "🔓" },
        ].map(s => (
          <div key={s.l} style={{
            background: "#fff", borderRadius: 16, padding: "16px 20px",
            border: "2px solid #f1f5f9", textAlign: "center", minWidth: 90,
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontFamily: "var(--fh)", fontWeight: 900, color: "#1e293b" }}>{s.n}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "var(--fb)", fontWeight: 600 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Step1({ data, setData, onNext }) {
  const tauxAct = data.tauxActivite || 100;
  const valid = data.salaire && data.canton && data.age;
  const cantonObj = CANTONS.find(c => c.id === data.canton);
  const smicHoraire = cantonObj?.smicHoraire || 0;
  const salaireMensuel = (data.salaire || 0) / 12;
  const heuresMensuelles = 173.33 * (tauxAct / 100);
  const salaireHoraire = heuresMensuelles > 0 && data.salaire ? salaireMensuel / heuresMensuelles : 0;
  const isDumping = data.salaire && data.canton && smicHoraire > 0 && salaireHoraire > 0 && salaireHoraire < smicHoraire;

  return (
    <Layout step={0} title="Vos données pro" sub="Les bases pour votre estimation personnalisée.">
      <Field label="Salaire brut annuel visé">
        <NumInput value={data.salaire} onChange={v => setData({ ...data, salaire: parseInt(v) || "" })} placeholder="ex : 95 000" suffix="CHF" />
      </Field>
      <Field label="Canton de travail">
        <Chips options={CANTONS.map(c => ({ id: c.id, label: c.label }))} value={data.canton} onChange={v => setData({ ...data, canton: v })} columns="repeat(3, 1fr)" />
      </Field>
      <Field label={`Taux d'activité : ${tauxAct}%`}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <input type="range" min={10} max={100} step={10} value={tauxAct}
            onChange={e => setData({ ...data, tauxActivite: parseInt(e.target.value) })}
            style={{ flex: 1 }}
          />
          <div style={{
            minWidth: 64, padding: "10px 14px",
            background: "#fff", borderRadius: 12,
            border: "2px solid #e2e8f0", textAlign: "center",
            fontSize: 17, fontWeight: 900, color: "#1e293b",
            fontFamily: "var(--fh)",
          }}>
            {tauxAct}%
          </div>
        </div>
        {tauxAct < 100 && data.salaire && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "#F8FAFC", borderRadius: 12, fontSize: 13, color: "#64748b", fontWeight: 600, fontFamily: "var(--fb)" }}>
            💡 Salaire horaire réel : <strong style={{ color: "#FF6B35" }}>{(Math.round(salaireHoraire * 100) / 100).toFixed(2)} CHF/h</strong>
            {smicHoraire > 0 && <span> (minimum {cantonObj.label} : {smicHoraire} CHF/h)</span>}
          </div>
        )}
      </Field>

      {isDumping && (
        <div style={{
          padding: 20, background: "#FEF2F2",
          border: "2.5px solid #FCA5A5", borderRadius: 18,
          marginBottom: 20, animation: "slideUp 0.4s ease",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
          }}>
            <span style={{ fontSize: 24 }}>🚨</span>
            <span style={{
              fontSize: 16, fontWeight: 900, color: "#DC2626",
              fontFamily: "var(--fh)",
            }}>ALERTE : Dumping Salarial Détecté</span>
          </div>
          <p style={{
            fontSize: 14, color: "#991B1B", lineHeight: 1.65,
            fontFamily: "var(--fb)", fontWeight: 600, margin: "0 0 10px",
          }}>
            Attention, d'après votre taux d'activité de <strong>{tauxAct}%</strong>, votre rémunération horaire ({(Math.round(salaireHoraire * 100) / 100).toFixed(2)} CHF/h) est inférieure au <strong>minimum légal de {cantonObj.label}</strong> ({smicHoraire} CHF/h).
          </p>
          <p style={{
            fontSize: 14, color: "#991B1B", lineHeight: 1.65,
            fontFamily: "var(--fb)", fontWeight: 700, margin: 0,
          }}>
            <strong>Le risque :</strong> Votre contrat pourrait être illégal. Continuez la simulation — vous recevrez par email un diagnostic complet et les étapes à suivre pour sécuriser votre projet.
          </p>
        </div>
      )}

      <Field label="Votre âge">
        <NumInput value={data.age} onChange={v => setData({ ...data, age: parseInt(v) || "" })} placeholder="ex : 38" />
        {data.age && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "#F8FAFC", borderRadius: 12, fontSize: 13, color: "#64748b", fontWeight: 600, fontFamily: "var(--fb)" }}>
            💡 Taux LPP applicable : <strong style={{ color: "#FF6B35" }}>{getLPPRate(data.age || 30) * 100}%</strong>
            {data.age < 25 && " (pas de cotisation LPP avant 25 ans)"}
          </div>
        )}
      </Field>
      <div style={{ marginTop: 28 }}>
        <Btn onClick={valid ? onNext : null} disabled={!valid}>
          Continuer →
        </Btn>
      </div>
    </Layout>
  );
}

function Step2({ data, setData, onNext }) {
  const valid = data.situation;
  const r = data.salaire ? computeResults(data) : null;

  return (
    <Layout step={1} title="Situation personnelle" sub="Impact direct sur votre barème fiscal.">
      <Field label="Situation familiale">
        <Chips options={SITUATIONS} value={data.situation} onChange={v => setData({ ...data, situation: v })} columns="1fr 1fr 1fr" />
      </Field>
      <Field label="Enfants à charge">
        <Chips options={ENFANTS_OPTS} value={data.enfants} onChange={v => setData({ ...data, enfants: parseInt(v) })} columns="repeat(4, 1fr)" />
      </Field>
      <Field label="Jours de télétravail">
        <Slider value={data.teletravail} onChange={v => setData({ ...data, teletravail: v })} />
        {r && r.teleAlert === "safe" && (
          <AlertBox type="success">
            Parfait. Vous restez en zone de neutralité fiscale. 100% de votre impôt reste en Suisse.
          </AlertBox>
        )}
        {r && r.teleAlert === "danger" && (
          <AlertBox type="danger">
            Au-delà de 40%, risque de requalification fiscale ! Votre impôt pourrait être dû en France. Un point crucial à valider en session.
          </AlertBox>
        )}
      </Field>
      <div style={{ marginTop: 28 }}>
        <Btn onClick={valid ? onNext : null} disabled={!valid}>Continuer →</Btn>
      </div>
    </Layout>
  );
}

function Step3({ data, setData, onNext }) {
  const r = computeResults(data);
  const diff = r.cmuMensuel - r.lamalMensuel;

  return (
    <Layout step={2} title="Le Duel Santé 2026" sub="LAMal ou CMU ? Un choix à plusieurs milliers d'euros/an.">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { id: "lamal", label: "LAMal Frontalier", price: r.lamalMensuel, sub: "Helsana 2026 — prime fixe", detail: "Indépendant du revenu" },
          { id: "cmu", label: "CMU (PUMa)", price: r.cmuMensuel, sub: "8% du RFR estimé", detail: `≈ ${fmt(r.cmuAnnuel)} CHF/an` },
        ].map(opt => {
          const active = data.sante === opt.id;
          return (
            <button key={opt.id} onClick={() => setData({ ...data, sante: opt.id })} style={{
              padding: 20, borderRadius: 18, cursor: "pointer",
              border: active ? "2.5px solid #FF6B35" : "2px solid #e2e8f0",
              background: active ? "linear-gradient(135deg, #FFF5EE, #FFFAF7)" : "#fff",
              textAlign: "center", transition: "all 0.2s ease",
            }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, fontFamily: "var(--fb)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 30, fontFamily: "var(--fh)", fontWeight: 900, color: active ? "#FF6B35" : "#1e293b" }}>
                {opt.price}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "var(--fb)", fontWeight: 600 }}>CHF / mois</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontFamily: "var(--fb)" }}>{opt.sub}</div>
            </button>
          );
        })}
      </div>

      {data.sante && (
        <div style={{
          padding: 16, background: "#F8FAFC", borderRadius: 14,
          fontSize: 14, color: "#475569", lineHeight: 1.6,
          fontFamily: "var(--fb)", fontWeight: 500, marginBottom: 20,
          border: "2px solid #f1f5f9",
        }}>
          {data.sante === "lamal" ? (
            <>
              <strong style={{ color: "#FF6B35" }}>LAMal Frontalier (Helsana 2026) :</strong> Prime fixe de 200 CHF/mois, indépendante du revenu. Libre choix du médecin en Suisse et en France.
              {diff > 0 && <span> Vous économisez <strong>{fmt(diff * 12)} CHF/an</strong> vs la CMU.</span>}
            </>
          ) : (
            <>
              <strong style={{ color: "#FF6B35" }}>CMU (PUMa) :</strong> Cotisation proportionnelle à 8% du Revenu Fiscal de Référence.
              {diff < 0 && <span> Vous économisez <strong>{fmt(Math.abs(diff) * 12)} CHF/an</strong> vs la LAMal.</span>}
              {diff >= 0 && <span> Attention : plus coûteuse que la LAMal pour votre niveau de revenu.</span>}
            </>
          )}
        </div>
      )}

      <Btn onClick={data.sante ? onNext : null} disabled={!data.sante}>
        Voir mes résultats →
      </Btn>
    </Layout>
  );
}

function Results({ data, onNext, emailSent }) {
  const r = computeResults(data);
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 200); }, []);

  return (
    <div style={{
      padding: "32px 20px", maxWidth: 520, margin: "0 auto",
      opacity: show ? 1 : 0, transform: show ? "none" : "translateY(15px)",
      transition: "all 0.6s ease",
    }}>
      <Progress step={4} total={6} />

      {/* Bandeau "email envoyé" */}
      {emailSent && (
        <div style={{
          padding: "14px 16px", marginBottom: 20,
          background: "linear-gradient(135deg, #F0FDF4, #F7FFF9)",
          border: "2px solid #BBF7D0", borderRadius: 14,
          display: "flex", alignItems: "flex-start", gap: 10,
          animation: "slideUp 0.5s ease",
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>📧</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#166534", fontFamily: "var(--fb)", marginBottom: 2 }}>
              Tes résultats t'ont aussi été envoyés par email
            </div>
            <div style={{ fontSize: 13, color: "#16A34A", fontFamily: "var(--fb)", fontWeight: 600, lineHeight: 1.5 }}>
              Pense à vérifier tes spams si tu ne le vois pas. Marque-le comme "non-spam" pour ne rien manquer.
            </div>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <span style={{
          display: "inline-block", padding: "6px 16px",
          background: "#FFF5EE", borderRadius: 50,
          fontSize: 12, fontWeight: 800, color: "#FF6B35",
          fontFamily: "var(--fb)", letterSpacing: "0.06em",
          textTransform: "uppercase", border: "2px solid #FFE0CC",
          marginBottom: 12,
        }}>Vos résultats</span>
        <h2 style={{ fontSize: 24, fontFamily: "var(--fh)", fontWeight: 900, color: "#1e293b", margin: 0 }}>
          Estimation détaillée
        </h2>
      </div>

      <Card label="Salaire brut annuel" value={`${fmt(r.brut)} CHF`} icon="💰" />

      <div style={{
        padding: "18px 20px", background: "#fff",
        border: "2px solid #f1f5f9", borderRadius: 16, marginBottom: 10,
      }}>
        <div style={{
          fontSize: 11, color: "#94a3b8", marginBottom: 14,
          textTransform: "uppercase", letterSpacing: "0.08em",
          fontFamily: "var(--fb)", fontWeight: 700,
        }}>
          📋 Cotisations sociales
        </div>
        {[
          { l: "AVS / AI / APG (5.3%)", v: r.avs },
          { l: "Assurance chômage (1.1%)", v: r.ac },
          { l: `LPP 2ème pilier (${r.lppRate}%)`, v: r.lpp },
        ].map(item => (
          <div key={item.l} style={{
            display: "flex", justifyContent: "space-between",
            marginBottom: 8, fontSize: 14, fontFamily: "var(--fb)", fontWeight: 600,
          }}>
            <span style={{ color: "#64748b" }}>{item.l}</span>
            <span style={{ color: "#EF4444" }}>−{fmt(item.v)}</span>
          </div>
        ))}
        <div style={{
          borderTop: "2px solid #f1f5f9", marginTop: 10,
          paddingTop: 10, display: "flex", justifyContent: "space-between",
          fontSize: 14, fontWeight: 800,
        }}>
          <span style={{ color: "#475569", fontFamily: "var(--fb)" }}>Net Social</span>
          <span style={{ color: "#1e293b", fontFamily: "var(--fh)" }}>{fmt(r.netSocial)} CHF</span>
        </div>
      </div>

      {r.regime === "source" && (
        <Card
          label={`Impôt à la source — ${r.canton}`}
          value={`−${fmt(r.impot)} CHF / an`}
          icon="🏛"
          sub={`Taux effectif : ${r.tauxIS}% (selon barème cantonal GE 2026)`}
        />
      )}
      {r.regime === "forfaitaire" && (
        <Card
          label={`Impôt forfaitaire — ${r.canton}`}
          value={`−${fmt(r.impot)} CHF / an`}
          icon="🏛"
          sub="Taux forfaitaire : 4.5% (prélevé à la source)"
        />
      )}
      {r.regime === "france" && (
        <Card
          label={`Impôt à la source — ${r.canton}`}
          value="0 CHF en Suisse"
          icon="🏛"
          sub="Impôt payé en France (accord de 1983)"
        />
      )}

      <div style={{
        padding: 16, marginBottom: 10, borderRadius: 14,
        background: r.regime === "france" ? "#FFFBEB" : r.regime === "forfaitaire" ? "#EFF6FF" : "#F0FDF4",
        border: `2px solid ${r.regime === "france" ? "#FDE68A" : r.regime === "forfaitaire" ? "#BFDBFE" : "#BBF7D0"}`,
      }}>
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>
            {r.regime === "france" ? "ℹ️" : r.regime === "forfaitaire" ? "ℹ️" : "✅"}
          </span>
          <p style={{
            fontSize: 13, lineHeight: 1.6, margin: 0,
            color: r.regime === "france" ? "#92400E" : r.regime === "forfaitaire" ? "#1E40AF" : "#166534",
            fontFamily: "var(--fb)", fontWeight: 600,
          }}>
            <strong>Note Fiscale :</strong> {r.noteFiscale}
          </p>
        </div>
      </div>

      <Card
        label="Net mensuel « dans la poche »"
        value={`${fmt(r.netMensuel)} CHF`}
        highlight
        icon="🎯"
        sub="Avant frais fixes (loyer, transports, assurance)"
      />

      <div style={{ marginTop: 24 }}>
        <Btn onClick={onNext}>Voir mon Reste à Vivre complet →</Btn>
      </div>
    </div>
  );
}

function LeadCapture({ data, onSubmit }) {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isDisposable = email && validEmailFormat && isDisposableEmail(email);
  const validEmail = validEmailFormat && !isDisposable;
  const valid = prenom.trim().length > 1 && nom.trim().length > 1 && validEmail;

  const inputStyle = {
    width: "100%", padding: "16px 18px",
    background: "#fff", border: "2px solid #e2e8f0",
    borderRadius: 16, color: "#1e293b",
    fontSize: 17, fontWeight: 700,
    fontFamily: "var(--fb)", outline: "none",
    transition: "border-color 0.3s, box-shadow 0.3s",
    boxSizing: "border-box",
  };
  const onFocus = e => { e.target.style.borderColor = "#FF6B35"; e.target.style.boxShadow = "0 0 0 4px rgba(255,107,53,0.1)"; };
  const onBlur = e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; };

  const handleSubmit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError("");

    const fullData = { ...data, prenom, nom, email };
    const r = computeResults(fullData);

    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          prenom,
          nom,
          salaire_brut: String(r.brut),
          canton: r.canton,
          charges_totales: String(r.totalCharges),
          reste_a_vivre: String(r.resteAVivre),
          newsletter_optin: newsletter,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Erreur serveur (email jetable, format invalide, etc.)
        if (result.error === "disposable") {
          setError(result.message || "Merci d'utiliser une adresse email personnelle.");
        } else {
          setError(result.message || "Une erreur est survenue. Réessayez dans un instant.");
        }
        setLoading(false);
        return;
      }

      // Succès : on passe à l'écran suivant avec indication email envoyé
      onSubmit({ prenom, nom, email, emailSent: true });
    } catch (err) {
      console.error("Erreur envoi lead:", err);
      // Fallback : on laisse quand même passer pour ne pas bloquer l'UX
      onSubmit({ prenom, nom, email, emailSent: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "32px 20px", maxWidth: 520, margin: "0 auto" }}>
      <Progress step={3} total={5} />
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: "linear-gradient(135deg, #FFF5EE, #FFE0CC)",
          border: "2px solid #FFD0B0",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 18px", fontSize: 32,
        }}>🔐</div>
        <h2 style={{ fontSize: 22, fontFamily: "var(--fh)", fontWeight: 900, color: "#1e293b", margin: "0 0 10px" }}>
          Débloquez votre estimation détaillée
        </h2>
        <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, fontFamily: "var(--fb)", fontWeight: 500 }}>
          Vos résultats sont prêts. Entrez vos coordonnées pour les consulter.
        </p>
      </div>

      <div style={{
        background: "#fff", borderRadius: 18, padding: 20,
        border: "2px solid #f1f5f9", marginBottom: 24,
      }}>
        {[
          { icon: "📊", text: "Estimation salariale détaillée : cotisations, impôts, net mensuel" },
          { icon: "🏠", text: "Reste à Vivre : loyer, transport, santé, courses — tout est inclus" },
          { icon: "🎯", text: "Verdict personnalisé + accès à la session stratégique de 45 min" },
        ].map((item, i) => (
          <div key={i} style={{
            display: "flex", gap: 12, alignItems: "flex-start",
            marginBottom: i < 2 ? 14 : 0,
            paddingBottom: i < 2 ? 14 : 0,
            borderBottom: i < 2 ? "1px solid #f1f5f9" : "none",
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
            <span style={{ fontSize: 14, color: "#475569", fontFamily: "var(--fb)", fontWeight: 600, lineHeight: 1.5 }}>{item.text}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 2 }}>
        <Field label="Prénom">
          <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Votre prénom" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </Field>
        <Field label="Nom">
          <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Votre nom" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </Field>
      </div>

      <Field label="Adresse e-mail">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom.nom@email.com" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        {isDisposable && (
          <div style={{
            marginTop: 8, padding: "10px 14px",
            background: "#FEF2F2", border: "2px solid #FECACA",
            borderRadius: 12, fontSize: 13, color: "#DC2626",
            fontFamily: "var(--fb)", fontWeight: 600,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <span style={{ flexShrink: 0 }}>⚠️</span>
            <span>Les emails jetables ne sont pas acceptés. Utilise une adresse personnelle (Gmail, Outlook, iCloud, Yahoo…).</span>
          </div>
        )}
      </Field>

      {/* Checkbox newsletter (optionnelle, non pré-cochée) */}
      <label style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "14px 16px", background: "#F8FAFC",
        borderRadius: 14, border: "2px solid #f1f5f9",
        marginBottom: 18, cursor: "pointer",
        fontFamily: "var(--fb)",
      }}>
        <input
          type="checkbox"
          checked={newsletter}
          onChange={e => setNewsletter(e.target.checked)}
          style={{
            width: 20, height: 20, marginTop: 2,
            accentColor: "#FF6B35",
            cursor: "pointer", flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13, color: "#475569", fontWeight: 600, lineHeight: 1.5 }}>
          Je souhaite recevoir les conseils exclusifs de Raphaël pour réussir mon projet frontalier (1 email/semaine, désinscription en 1 clic).
        </span>
      </label>

      <Btn onClick={handleSubmit} disabled={!valid || loading}>
        {loading ? "Envoi en cours..." : "Voir mes résultats →"}
      </Btn>

      {error && (
        <div style={{
          marginTop: 12, padding: "12px 14px",
          background: "#FEF2F2", border: "2px solid #FECACA",
          borderRadius: 12, color: "#DC2626", fontSize: 13,
          fontFamily: "var(--fb)", fontWeight: 600, textAlign: "center",
        }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 14, textAlign: "center", fontSize: 12, color: "#94a3b8", fontFamily: "var(--fb)", fontWeight: 600 }}>
        🔒 Vos données restent confidentielles. Zéro spam.
      </div>
    </div>
  );
}

function Final({ data }) {
  const r = computeResults(data);
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 200); }, []);

  const verdictColors = {
    rouge: { bg: "#FEF2F2", border: "#FCA5A5", accent: "#DC2626", icon: "🔴", cardBg: "linear-gradient(135deg, #FEF2F2, #FFF5F5)" },
    orange: { bg: "#FFFBEB", border: "#FDE68A", accent: "#D97706", icon: "🟡", cardBg: "linear-gradient(135deg, #FFFBEB, #FFFDF5)" },
    vert: { bg: "#F0FDF4", border: "#BBF7D0", accent: "#16A34A", icon: "🟢", cardBg: "linear-gradient(135deg, #F0FDF4, #F7FFF9)" },
  };
  const vc = verdictColors[r.verdict];
  const needsCTA = r.verdict === "rouge" || r.verdict === "orange";

  // Alerte supplémentaire si dumping détecté (récupéré ici puisque plus bloqué en Step1)
  const dumpingAlert = r.isDumping;

  return (
    <div style={{
      padding: "32px 20px", maxWidth: 520, margin: "0 auto",
      opacity: show ? 1 : 0, transform: show ? "none" : "translateY(20px)",
      transition: "all 0.7s ease",
    }}>
      <Progress step={6} total={6} />

      {/* Alerte dumping en haut (avant le verdict) */}
      {dumpingAlert && (
        <div style={{
          padding: 18, background: "#FEF2F2",
          border: "2.5px solid #FCA5A5", borderRadius: 18,
          marginBottom: 20, animation: "slideUp 0.4s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>🚨</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: "#DC2626", fontFamily: "var(--fh)" }}>
              Alerte : Dumping Salarial Détecté
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#991B1B", lineHeight: 1.6, fontFamily: "var(--fb)", fontWeight: 600, margin: 0 }}>
            Votre rémunération horaire ({r.salaireHoraire.toFixed(2)} CHF/h) est inférieure au minimum légal de {r.canton} ({r.smicHoraire} CHF/h). À vérifier impérativement avec un expert avant signature.
          </p>
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{
          width: 80, height: 80, borderRadius: 24,
          background: vc.cardBg, border: `2.5px solid ${vc.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 18px", fontSize: 38,
        }}>{vc.icon}</div>
        <div style={{
          display: "inline-block", padding: "6px 16px",
          background: vc.bg, borderRadius: 50,
          border: `2px solid ${vc.border}`,
          fontSize: 13, fontWeight: 900, color: vc.accent,
          fontFamily: "var(--fh)", letterSpacing: "0.04em",
          marginBottom: 12,
        }}>{r.verdictLabel}</div>
        <h2 style={{
          fontSize: 24, fontFamily: "var(--fh)", fontWeight: 900,
          color: "#1e293b", lineHeight: 1.3, margin: 0,
        }}>
          Votre projet frontalier
        </h2>
      </div>

      <div style={{
        padding: 28, borderRadius: 22, textAlign: "center",
        background: vc.cardBg,
        border: `2.5px solid ${vc.border}`, marginBottom: 14,
        boxShadow: `0 8px 30px ${vc.accent}18`,
      }}>
        <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "var(--fb)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          Reste à vivre estimé
        </div>
        <div style={{ fontSize: 46, fontFamily: "var(--fh)", fontWeight: 900, color: vc.accent, lineHeight: 1 }}>
          {fmt(r.resteAVivre)} CHF
        </div>
        <div style={{ fontSize: 14, color: "#64748b", fontFamily: "var(--fb)", fontWeight: 600, marginTop: 6 }}>par mois, après toutes charges</div>
        {r.gainPct > 0 && (
          <div style={{
            marginTop: 16, padding: "10px 20px",
            background: "#F0FDF4", border: "2px solid #BBF7D0",
            borderRadius: 12, display: "inline-block",
            fontSize: 15, fontFamily: "var(--fh)", fontWeight: 800,
            color: "#16A34A",
          }}>
            +{r.gainPct}% vs un salaire français
          </div>
        )}
      </div>

      <div style={{
        padding: 20, background: vc.bg,
        border: `2px solid ${vc.border}`,
        borderRadius: 18, marginBottom: 14,
      }}>
        <p style={{
          fontSize: 15, color: r.verdict === "vert" ? "#166534" : r.verdict === "orange" ? "#92400E" : "#991B1B",
          lineHeight: 1.7, fontFamily: "var(--fb)", fontWeight: 700, margin: 0,
        }}>
          {r.verdictMsg}
        </p>
      </div>

      <div style={{
        background: "#fff", borderRadius: 18, padding: 20,
        border: "2px solid #f1f5f9", marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, fontFamily: "var(--fb)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
          Décomposition mensuelle
        </div>
        {[
          { l: "Net dans la poche", v: r.netMensuel, color: "#1e293b", bold: true },
          { l: `Loyer moyen (74 / Ain)`, v: -r.loyer, color: "#EF4444" },
          { l: "Transport frontalier", v: -r.transport, color: "#EF4444" },
          { l: "Courses / alimentation", v: -r.courses, color: "#EF4444" },
          { l: `Assurance santé (${data.sante === "lamal" ? "LAMal" : "CMU"})`, v: -r.assurance, color: "#EF4444" },
        ].map((item, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between",
            marginBottom: 8, fontSize: 14, fontFamily: "var(--fb)",
            fontWeight: item.bold ? 800 : 600,
            paddingBottom: i === 0 ? 10 : 0,
            borderBottom: i === 0 ? "2px solid #f1f5f9" : "none",
          }}>
            <span style={{ color: "#64748b" }}>{item.l}</span>
            <span style={{ color: item.color }}>{item.v > 0 ? fmt(item.v) : `−${fmt(Math.abs(item.v))}`} CHF</span>
          </div>
        ))}
        <div style={{
          borderTop: "2px solid #f1f5f9", marginTop: 8, paddingTop: 10,
          display: "flex", justifyContent: "space-between",
          fontSize: 16, fontWeight: 900, fontFamily: "var(--fh)",
        }}>
          <span style={{ color: vc.accent }}>= Reste à vivre</span>
          <span style={{ color: vc.accent }}>{fmt(r.resteAVivre)} CHF</span>
        </div>
      </div>

      <div style={{
        padding: 22, background: "#fff",
        borderRadius: 18, marginBottom: 24,
        border: "2px solid #f1f5f9",
      }}>
        {dumpingAlert ? (
          <>
            <p style={{ fontSize: 15, color: "#1e293b", lineHeight: 1.7, fontFamily: "var(--fb)", fontWeight: 600, margin: "0 0 12px" }}>
              <strong style={{ color: "#DC2626" }}>Votre contrat présente un risque de dumping salarial.</strong> C'est une situation à ne surtout pas prendre à la légère — l'administration peut refuser votre Permis G.
            </p>
            <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, fontFamily: "var(--fb)", fontWeight: 500, margin: 0 }}>
              En 45 min, nous analysons votre contrat et définissons la stratégie pour sécuriser votre projet avant signature.
            </p>
          </>
        ) : needsCTA ? (
          <>
            <p style={{ fontSize: 15, color: "#1e293b", lineHeight: 1.7, fontFamily: "var(--fb)", fontWeight: 600, margin: "0 0 12px" }}>
              <strong style={{ color: vc.accent }}>Votre budget est {r.verdict === "rouge" ? "trop serré" : "fragile"}.</strong> Avant de vous lancer, il est essentiel d'optimiser chaque poste de dépense et de valider votre stratégie avec un expert du marché suisse.
            </p>
            <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, fontFamily: "var(--fb)", fontWeight: 500, margin: 0 }}>
              En 45 min, nous identifierons les leviers concrets pour sécuriser votre installation et maximiser votre reste à vivre.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 15, color: "#1e293b", lineHeight: 1.7, fontFamily: "var(--fb)", fontWeight: 600, margin: "0 0 12px" }}>
              <strong style={{ color: "#FF6B35" }}>Mais attention :</strong> la théorie ne remplace pas la stratégie. Le marché caché suisse ne s'offre qu'aux profils <em>parfaitement préparés</em>.
            </p>
            <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, fontFamily: "var(--fb)", fontWeight: 500, margin: 0 }}>
              Pendant 45 min, nous analysons votre éligibilité réelle, votre stratégie de négociation salariale et la viabilité de votre projet frontalier.
            </p>
          </>
        )}
      </div>

      <a href="https://calendly.com/esprraphael/strategie-de-reussite-en-tant-que-frontalier-suisse" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>
        <Btn style={dumpingAlert ? {
          background: "linear-gradient(135deg, #DC2626, #EF4444)",
          boxShadow: "0 4px 20px rgba(220,38,38,0.35)",
        } : needsCTA ? {
          background: r.verdict === "rouge" ? "linear-gradient(135deg, #DC2626, #EF4444)" : "linear-gradient(135deg, #D97706, #F59E0B)",
          boxShadow: r.verdict === "rouge" ? "0 4px 20px rgba(220,38,38,0.35)" : "0 4px 20px rgba(217,119,6,0.35)",
        } : {}}>
          {dumpingAlert ? "🛡 Sécuriser mon contrat avec Raphaël — 45 min" : needsCTA ? "🛡 Sécuriser mon budget avec Raphaël — 45 min" : "🗓 Réserver ma Session Stratégique de 45 minutes"}
        </Btn>
      </a>

      <div style={{
        marginTop: 24, padding: 20, background: "#FFFAF7",
        borderRadius: 18, border: "2px solid #FFE0CC",
      }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 2, marginBottom: 10 }}>
          {[1,2,3,4,5].map(s => <span key={s} style={{ color: "#FF6B35", fontSize: 18 }}>★</span>)}
        </div>
        <p style={{ fontSize: 14, color: "#475569", fontStyle: "italic", lineHeight: 1.6, fontFamily: "var(--fb)", fontWeight: 500, margin: "0 0 8px", textAlign: "center" }}>
          « J'ai décroché un poste à 92k CHF grâce à un CV et un profil LinkedIn optimisés. L'investissement a été rentabilisé dès le premier mois. »
        </p>
        <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700, fontFamily: "var(--fb)", textAlign: "center" }}>
          — Sarah M., frontalière depuis 2024
        </div>
      </div>
    </div>
  );
}

function Layout({ step, title, sub, children }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 80); }, []);

  return (
    <div style={{
      padding: "32px 20px", maxWidth: 520, margin: "0 auto",
      opacity: show ? 1 : 0, transform: show ? "none" : "translateY(12px)",
      transition: "all 0.5s ease",
    }}>
      <Progress step={step} total={5} />
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 24, fontFamily: "var(--fh)", fontWeight: 900, color: "#1e293b", margin: "0 0 6px" }}>{title}</h2>
        <p style={{ fontSize: 14, color: "#64748b", margin: 0, fontFamily: "var(--fb)", fontWeight: 500 }}>{sub}</p>
      </div>
      {children}
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("accueil");
  const [emailSent, setEmailSent] = useState(false);
  const [data, setData] = useState({
    salaire: "", canton: "", age: "",
    situation: "", enfants: 0, teletravail: 0,
    tauxActivite: 100,
    sante: "", prenom: "", nom: "", email: "",
  });

  const ref = useRef(null);
  const goTo = (s) => {
    setScreen(s);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const flow = ["accueil", "step1", "step2", "step3", "leadcapture", "results", "final"];

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap'); :root { --fh: 'Nunito', sans-serif; --fb: 'Plus Jakarta Sans', sans-serif; } * { margin: 0; padding: 0; box-sizing: border-box; } body { background: #F8FAFC; } @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } input[type="range"] { -webkit-appearance: none; height: 8px; border-radius: 4px; background: #e2e8f0; outline: none; } input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, #FF6B35, #FF8F5E); cursor: pointer; box-shadow: 0 2px 10px rgba(255,107,53,0.4); } input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; } input[type="number"] { -moz-appearance: textfield; } ::selection { background: #FFE0CC; color: #FF6B35; }`}</style>

      <div ref={ref} style={{ minHeight: "100vh", background: "#F8FAFC", position: "relative" }}>
        <div style={{ position: "fixed", top: -100, right: -80, width: 300, height: 300, background: "radial-gradient(circle, rgba(255,107,53,0.06), transparent 65%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "fixed", bottom: -80, left: -80, width: 250, height: 250, background: "radial-gradient(circle, rgba(255,179,71,0.05), transparent 65%)", borderRadius: "50%", pointerEvents: "none" }} />

        {screen !== "accueil" && (
          <div style={{
            padding: "14px 20px", display: "flex",
            alignItems: "center", justifyContent: "space-between",
            background: "rgba(248,250,252,0.9)",
            backdropFilter: "blur(10px)",
            position: "sticky", top: 0, zIndex: 10,
            borderBottom: "1px solid #f1f5f9",
          }}>
            <button onClick={() => {
              const idx = flow.indexOf(screen);
              if (idx > 0) goTo(flow[idx - 1]);
            }} style={{
              background: "none", border: "none",
              color: "#64748b", fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: "var(--fb)",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              ← Retour
            </button>
            <div style={{
              fontSize: 12, color: "#94a3b8",
              fontFamily: "var(--fb)", fontWeight: 700,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              🇨🇭 Simulateur 2026
            </div>
          </div>
        )}

        {screen === "accueil" && <Accueil onStart={() => goTo("step1")} />}
        {screen === "step1" && <Step1 data={data} setData={setData} onNext={() => goTo("step2")} />}
        {screen === "step2" && <Step2 data={data} setData={setData} onNext={() => goTo("step3")} />}
        {screen === "step3" && <Step3 data={data} setData={setData} onNext={() => goTo("leadcapture")} />}
        {screen === "leadcapture" && <LeadCapture data={data} onSubmit={({ prenom, nom, email, emailSent: es }) => { setData({ ...data, prenom, nom, email }); setEmailSent(es); goTo("results"); }} />}
        {screen === "results" && <Results data={data} emailSent={emailSent} onNext={() => goTo("final")} />}
        {screen === "final" && <Final data={data} />}
      </div>
    </>
  );
}

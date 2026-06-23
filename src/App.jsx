import { useState, useEffect, useRef } from "react";

// ─── DATA 2026 ───────────────────────────────────────────────────────────────

const TAUX_CHANGE = 1.07; // CHF -> EUR (taux fiscal officiel revenus 2025)

// lamalAdulte = prime moyenne adulte (26+) officielle OFSP 2026, par canton de travail.
// Source : communiqué OFSP/DFI du 23.09.2025 (moyenne nationale adulte 465,30 CHF).
// GE 586, NE 529, VD 527, JU 520, BE 470, VS 439 (primes moyennes adulte 2026).
// BS/BL non publiés dans les communiqués romands : BS > 500 (estimé 510), BL estimé 480.
const CANTONS = [
  { id: "geneve",     label: "Genève",        regime: "source", smicHoraire: 24.59, lamalAdulte: 586 },
  { id: "vaud",       label: "Vaud",          regime: "france", smicHoraire: 0,     lamalAdulte: 527 },
  { id: "valais",     label: "Valais",        regime: "france", smicHoraire: 0,     lamalAdulte: 439 },
  { id: "neuchatel",  label: "Neuchâtel",     regime: "france", smicHoraire: 21.35, lamalAdulte: 529 },
  { id: "jura",       label: "Jura",          regime: "france", smicHoraire: 21.40, lamalAdulte: 520 },
  { id: "berne",      label: "Berne",         regime: "france", smicHoraire: 0,     lamalAdulte: 470 },
  { id: "bale_ville", label: "Bâle-Ville",    regime: "france", smicHoraire: 22.20, lamalAdulte: 510 },
  { id: "bale_camp",  label: "Bâle-Camp.",    regime: "france", smicHoraire: 0,     lamalAdulte: 480 },
];

const SITUATIONS = [
  { id: "celibataire", label: "Célibataire", icon: "👤" },
  { id: "marie", label: "Marié — 1 revenu", icon: "👫" },
  { id: "marie2", label: "Marié — 2 revenus", icon: "👥" },
];

const ENFANTS_OPTS = [
  { id: 0, label: "0" }, { id: 1, label: "1" },
  { id: 2, label: "2" }, { id: 3, label: "3+" },
];

// ─── PARAMÈTRES 2026 ─────────────────────────────────────────────────────────

const PLAFOND_AC = 148200, DEDUCTION_COORD = 26460, SEUIL_LPP = 22680, SALAIRE_COORD_MAX = 64260;
const TAUX_AVS = 0.053, TAUX_AC = 0.011, TAUX_AANP = 0.012;
const PASS_2026 = 48060, ABATTEMENT_CMU = PASS_2026 * 0.25, TAUX_CMU = 0.08;
const LAMAL_ENFANT = 122; // prime moyenne enfant OFSP 2026 : 122,50 CHF

const BAREME_FR = [
  { max: 11600, taux: 0 }, { max: 29579, taux: 0.11 }, { max: 84577, taux: 0.30 },
  { max: 181917, taux: 0.41 }, { max: Infinity, taux: 0.45 },
];

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

// ─── MOTEUR ──────────────────────────────────────────────────────────────────

function getLPPRate(age) {
  if (age < 25) return 0;
  if (age < 35) return 0.035;
  if (age < 45) return 0.05;
  if (age < 55) return 0.075;
  return 0.09;
}

function getParts(situation, enfants) {
  let parts = situation === "celibataire" ? 1 : 2;
  if (enfants >= 1) parts += 0.5;
  if (enfants >= 2) parts += 0.5;
  if (enfants >= 3) parts += (enfants - 2) * 1;
  return parts;
}

function impotFrance(revenuImposable, parts, situation) {
  const parPart = (rev, p) => {
    const base = rev / p;
    let imp = 0, prev = 0;
    for (const t of BAREME_FR) {
      if (base > prev) { imp += (Math.min(base, t.max) - prev) * t.taux; prev = t.max; }
      else break;
    }
    return imp * p;
  };
  const partsBase = situation === "celibataire" ? 1 : 2;
  const impAvecQF = parPart(revenuImposable, parts);
  const impSansQF = parPart(revenuImposable, partsBase);
  const demiPartsSup = (parts - partsBase) / 0.5;
  const avantageMax = demiPartsSup * 1807; // plafond QF 2026 : 1 807 €/demi-part
  const avantageReel = impSansQF - impAvecQF;
  const imp = avantageReel > avantageMax ? impSansQF - avantageMax : impAvecQF;
  return Math.max(0, Math.round(imp));
}

function computeImpot(brutCHF, netSocialCHF, cantonObj, situation, enfants) {
  if (cantonObj.regime === "source") {
    const mensuel = brutCHF / 12;
    const baremeA0 = [
      { max: 1799, taux: 0 }, { max: 3633, taux: 0.04 }, { max: 4166, taux: 0.06 },
      { max: 5416, taux: 0.08 }, { max: 6250, taux: 0.10 }, { max: 7083, taux: 0.11 },
      { max: 7916, taux: 0.12 }, { max: 9583, taux: 0.13 }, { max: 11250, taux: 0.15 },
      { max: 12500, taux: 0.165 }, { max: 14583, taux: 0.165 }, { max: 16666, taux: 0.175 },
      { max: 20833, taux: 0.19 }, { max: 25000, taux: 0.21 }, { max: Infinity, taux: 0.235 },
    ];
    const tranche = baremeA0.find(t => mensuel <= t.max);
    let taux = tranche ? tranche.taux : 0.235;
    if (situation === "marie") taux *= 0.62;   // approx barème B (monoactif), cible ~8%
    if (situation === "marie2") taux *= 1.05;   // approx barème C (biactif), cible ~14%
    taux = Math.max(0, taux - Math.min(enfants, 3) * 0.015);
    const montantCHF = Math.round(brutCHF * taux);
    return {
      regime: "source", montantAnnuelCHF: montantCHF,
      montantAnnuelEUR: Math.round(montantCHF * TAUX_CHANGE),
      taux: Math.round(taux * 1000) / 10,
      noteFiscale: "À Genève, l'impôt est prélevé directement sur votre salaire chaque mois (impôt à la source). Vous déclarez ce revenu en France mais ne le payez pas une 2e fois. Estimation au barème célibataire ajusté ; un calcul exact dépend de votre situation.",
    };
  }
  const revenuEUR = netSocialCHF * TAUX_CHANGE;
  const revenuImposable = revenuEUR * 0.9;
  const parts = getParts(situation, enfants);
  const sit = situation === "celibataire" ? "celibataire" : "couple";
  const impEUR = impotFrance(revenuImposable, parts, sit);
  const tauxMoyen = revenuImposable > 0 ? (impEUR / revenuImposable) * 100 : 0;
  return {
    regime: "france", montantAnnuelCHF: 0, montantAnnuelEUR: impEUR,
    taux: Math.round(tauxMoyen * 10) / 10,
    noteFiscale: `À ${cantonObj.label}, aucun impôt n'est prélevé en Suisse : vous payez en France (accord de 1983). Il n'est PAS retenu sur la paie, vous devez le provisionner. Estimation : ${new Intl.NumberFormat("fr-FR").format(impEUR)} €/an au barème français avec quotient familial.`,
  };
}

function computeResults(data) {
  const cantonObj = CANTONS.find(c => c.id === data.canton) || CANTONS[0];
  const tauxActivite = (data.tauxActivite || 100) / 100;
  const brut = data.salaire || 0;

  const avs = Math.round(brut * TAUX_AVS);
  const ac = Math.round(Math.min(brut, PLAFOND_AC) * TAUX_AC);
  const aanp = Math.round(Math.min(brut, PLAFOND_AC) * TAUX_AANP);
  const deductionCoord = DEDUCTION_COORD * tauxActivite;
  const salaireCoord = Math.min(SALAIRE_COORD_MAX, Math.max(0, brut - deductionCoord));
  const lppRate = brut >= SEUIL_LPP ? getLPPRate(data.age || 30) : 0;
  const lpp = Math.round(salaireCoord * lppRate);
  const totalCotisations = avs + ac + aanp + lpp;
  const netSocial = brut - totalCotisations;

  const impotData = computeImpot(brut, netSocial, cantonObj, data.situation, data.enfants || 0);

  const netSocialEUR = netSocial * TAUX_CHANGE;
  const netApresImpotEUR = netSocialEUR - impotData.montantAnnuelEUR;
  const netMensuelEUR = Math.round(netApresImpotEUR / 12);
  const netMensuelCHF = Math.round(netSocial / 12);

  const age = data.age || 30;
  const primeAdulte = cantonObj.lamalAdulte;
  const primeJeune = Math.round(primeAdulte * 0.70); // jeune adulte OFSP : 326,30/465,30
  let lamalCHF = age < 26 ? primeJeune : primeAdulte;
  if (data.situation === "marie" || data.situation === "marie2") lamalCHF += primeAdulte;
  lamalCHF += (data.enfants || 0) * LAMAL_ENFANT;
  const lamalEUR = Math.round(lamalCHF * TAUX_CHANGE);

  const rfrEstime = netSocialEUR * 0.9;
  const assietteCMU = Math.max(0, rfrEstime - ABATTEMENT_CMU);
  const cmuAnnuel = Math.round(assietteCMU * TAUX_CMU);
  const cmuMensuel = Math.round(cmuAnnuel / 12);

  const assuranceEUR = data.sante === "lamal" ? lamalEUR : data.sante === "cmu" ? cmuMensuel : 0;

  const personnes = 1 + (data.situation !== "celibataire" ? 1 : 0) + (data.enfants || 0);
  const loyer = data.situation === "celibataire" && (data.enfants || 0) === 0 ? 650 : 950;
  const transport = Math.round(180 * tauxActivite);
  const courses = Math.round(280 * (0.6 + 0.4 * personnes));
  const totalCharges = loyer + transport + courses + assuranceEUR;
  const resteAVivre = netMensuelEUR - totalCharges;

  const netFranceMensuel = Math.round((brut * TAUX_CHANGE) * 0.78 / 12 * 0.62);
  const gainPct = netFranceMensuel > 0
    ? Math.round(((netMensuelEUR - netFranceMensuel) / netFranceMensuel) * 100) : 0;

  let teleAlert = "";
  const telePct = (data.teletravail || 0) / 5 * 100;
  if (telePct > 0 && telePct <= 40) teleAlert = "safe";
  else if (telePct > 40) teleAlert = "danger";

  const smicHoraire = cantonObj.smicHoraire || 0;
  const heuresMensuelles = 173.33 * tauxActivite;
  const salaireHoraire = heuresMensuelles > 0 ? (brut / 12) / heuresMensuelles : 0;
  const isDumping = smicHoraire > 0 && salaireHoraire < smicHoraire && brut > 0;

  let verdict = "vert", verdictLabel = "Projet solide";
  let verdictMsg = "Votre reste à vivre est confortable pour une installation sereine.";
  if (resteAVivre < 400) {
    verdict = "rouge"; verdictLabel = "Projet sous haute tension";
    verdictMsg = `Il ne vous reste qu'environ ${Math.round(resteAVivre)} € de marge mensuelle. Vos charges fixes absorbent presque tout votre revenu. C'est un risque pour votre équilibre financier.`;
  } else if (resteAVivre < 1200) {
    verdict = "orange"; verdictLabel = "Vigilance";
    verdictMsg = "Votre projet est viable mais la marge de sécurité est faible face aux imprévus (santé, voiture, inflation).";
  }

  return {
    brut, avs, ac, aanp, lpp, lppRate: Math.round(lppRate * 1000) / 10,
    totalCotisations, netSocial,
    regime: impotData.regime, noteFiscale: impotData.noteFiscale,
    impotEUR: impotData.montantAnnuelEUR, impotCHF: impotData.montantAnnuelCHF, tauxIS: impotData.taux,
    netMensuelEUR, netMensuelCHF,
    lamalEUR, lamalCHF, cmuMensuel, cmuAnnuel,
    assuranceEUR, loyer, transport, courses, totalCharges,
    resteAVivre, gainPct, netFranceMensuel,
    teleAlert, telePct,
    canton: cantonObj.label, tauxActivite: data.tauxActivite || 100,
    isDumping, smicHoraire, salaireHoraire: Math.round(salaireHoraire * 100) / 100,
    verdict, verdictLabel, verdictMsg, tauxChange: TAUX_CHANGE,
  };
}

const fmtCHF = (n) => new Intl.NumberFormat("fr-CH").format(Math.round(n));
const fmtEUR = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
:root {
  --fh:'Space Grotesk',sans-serif; --fb:'Inter',sans-serif;
  --accent:#FF6B35; --border:rgba(226,232,240,0.85); --border-accent:rgba(255,107,53,0.28);
  --surface:rgba(255,255,255,0.88);
  --t1:#0F172A; --t2:#475569; --t3:#94A3B8;
  --success:#10B981; --warning:#F59E0B; --danger:#EF4444;
  --sh-sm:0 1px 4px rgba(0,0,0,0.05),0 2px 8px rgba(0,0,0,0.04);
  --sh-md:0 4px 20px rgba(0,0,0,0.07),0 1px 4px rgba(0,0,0,0.04);
  --sh-accent:0 8px 32px rgba(255,107,53,0.28);
  --r-sm:10px; --r-md:14px; --r-lg:20px; --r-xl:28px;
}
* { margin:0; padding:0; box-sizing:border-box; }
body { background:linear-gradient(155deg,#EEF2FF 0%,#F8FAFF 40%,#FFF6F1 100%); min-height:100vh; font-family:var(--fb); -webkit-font-smoothing:antialiased; }
@keyframes float { 0%,100%{transform:translate(0,0);} 33%{transform:translate(18px,-22px);} 66%{transform:translate(-12px,12px);} }
@keyframes floatB { 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(-18px,16px) scale(1.06);} }
@keyframes glowPulse { 0%,100%{box-shadow:var(--sh-accent);} 50%{box-shadow:0 8px 48px rgba(255,107,53,0.45),0 0 80px rgba(255,107,53,0.12);} }
@keyframes checkPop { 0%{transform:scale(0) rotate(-12deg);opacity:0;} 65%{transform:scale(1.25) rotate(4deg);opacity:1;} 100%{transform:scale(1) rotate(0deg);opacity:1;} }
@keyframes shimmer { 0%{background-position:-200% center;} 100%{background-position:200% center;} }
@keyframes barGrow { from{transform:scaleX(0);} to{transform:scaleX(1);} }
@keyframes countReveal { from{opacity:0;transform:translateY(10px) scale(0.96);} to{opacity:1;transform:translateY(0) scale(1);} }
@keyframes badgePop { 0%{transform:scale(0.8);opacity:0;} 60%{transform:scale(1.05);opacity:1;} 100%{transform:scale(1);opacity:1;} }
@keyframes slideUp { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:translateY(0);} }
@keyframes spin { to{transform:rotate(360deg);} }
input[type="range"] { -webkit-appearance:none; width:100%; height:6px; border-radius:99px; outline:none; cursor:pointer; }
input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:24px; height:24px; border-radius:50%; background:linear-gradient(135deg,#FF6B35,#FF8F5E); cursor:pointer; box-shadow:0 2px 8px rgba(255,107,53,0.4),0 0 0 3px white; }
input[type="number"]::-webkit-inner-spin-button,input[type="number"]::-webkit-outer-spin-button { -webkit-appearance:none; }
input[type="number"] { -moz-appearance:textfield; }
::selection { background:rgba(255,107,53,0.14); color:#E55A28; }
`;

// ─── HOOKS / PRIMITIVES ──────────────────────────────────────────────────────

function useMount(delay = 60) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), delay); return () => clearTimeout(t); }, []);
  return on;
}
function useCountUp(target, active = true, duration = 1100) {
  const [val, setVal] = useState(0);
  const rafRef = useRef(), t0Ref = useRef();
  useEffect(() => {
    if (!active || !target) { setVal(target || 0); return; }
    t0Ref.current = null;
    const run = (ts) => {
      if (!t0Ref.current) t0Ref.current = ts;
      const p = Math.min((ts - t0Ref.current) / duration, 1);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 4))));
      if (p < 1) rafRef.current = requestAnimationFrame(run);
    };
    rafRef.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, active, duration]);
  return active ? val : target;
}

function Progress({ step, total }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", gap: 5 }}>
        {Array.from({ length: total }, (_, i) => {
          const done = i < step, active = i === step;
          return (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, overflow: "hidden", background: done || active ? "transparent" : "rgba(226,232,240,0.7)", position: "relative" }}>
              {(done || active) && <div style={{ position: "absolute", inset: 0, background: done ? "linear-gradient(90deg,#FF6B35,#FF8F5E)" : "linear-gradient(90deg,#FF6B35,#FFB347)", borderRadius: 99, backgroundSize: active ? "200% 100%" : "100% 100%", animation: active ? "shimmer 2s ease infinite" : "none" }} />}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, fontWeight: 600 }}>
        <span style={{ color: "var(--t3)" }}>Étape {step + 1} / {total}</span>
        <span style={{ color: "var(--accent)", fontWeight: 700 }}>{Math.round((step + 1) / total * 100)}%</span>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 10, letterSpacing: "0.09em", textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, placeholder, suffix }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: "100%", padding: "16px 18px", paddingRight: suffix ? 74 : 18, background: focused ? "#fff" : "rgba(255,255,255,0.82)", border: `2px solid ${focused ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--r-md)", color: "var(--t1)", fontSize: 19, fontWeight: 700, fontFamily: "var(--fh)", outline: "none", transition: "all 0.22s ease", boxShadow: focused ? "0 0 0 4px rgba(255,107,53,0.10),var(--sh-md)" : "var(--sh-sm)", boxSizing: "border-box", backdropFilter: "blur(10px)" }} />
      {suffix && <span style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: focused ? "var(--accent)" : "var(--t3)", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", pointerEvents: "none" }}>{suffix}</span>}
    </div>
  );
}

function RangeInput({ value, onChange, min = 0, max = 5, step = 1 }) {
  const pct = ((value - min) / (max - min)) * 100;
  return <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: "100%", background: `linear-gradient(to right,#FF6B35 ${pct}%,rgba(226,232,240,0.7) ${pct}%)` }} />;
}

function Chips({ options, value, onChange, columns }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: columns || `repeat(${Math.min(options.length, 3)},1fr)`, gap: 8 }}>
      {options.map(opt => {
        const active = String(value) === String(opt.id);
        return (
          <button key={opt.id} onClick={() => onChange(opt.id)}
            style={{ position: "relative", padding: "15px 10px", borderRadius: "var(--r-md)", border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "linear-gradient(135deg,rgba(255,107,53,0.07),rgba(255,179,71,0.04))" : "rgba(255,255,255,0.82)", color: active ? "var(--accent)" : "var(--t2)", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)", transform: active ? "translateY(-2px)" : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, boxShadow: active ? "0 4px 18px rgba(255,107,53,0.16),var(--sh-sm)" : "var(--sh-sm)" }}>
            {active && <div style={{ position: "absolute", top: 7, right: 7, width: 17, height: 17, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", animation: "checkPop 0.32s cubic-bezier(0.34,1.56,0.64,1)" }}><svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
            {opt.icon && <span style={{ fontSize: 22, lineHeight: 1 }}>{opt.icon}</span>}
            <span style={{ lineHeight: 1.3, textAlign: "center" }}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary", style: sx }) {
  const [pressed, setPressed] = useState(false);
  const base = { width: "100%", padding: "18px 24px", borderRadius: "var(--r-lg)", border: "none", fontSize: 16, fontWeight: 700, fontFamily: "var(--fh)", cursor: disabled ? "default" : "pointer", transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)", transform: pressed && !disabled ? "scale(0.975) translateY(1px)" : "scale(1)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 };
  const variants = {
    primary: { background: disabled ? "rgba(226,232,240,0.8)" : "linear-gradient(135deg,#FF6B35,#FF8F5E)", color: disabled ? "var(--t3)" : "#fff", boxShadow: disabled ? "none" : "var(--sh-accent)" },
    secondary: { background: "rgba(255,255,255,0.9)", color: "var(--t2)", border: "2px solid var(--border)", boxShadow: "var(--sh-sm)" },
    danger: { background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", boxShadow: "0 8px 28px rgba(239,68,68,0.3)" },
    warning: { background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#fff", boxShadow: "0 8px 28px rgba(245,158,11,0.3)" },
  };
  return <button onClick={disabled ? undefined : onClick} onMouseDown={() => !disabled && setPressed(true)} onMouseUp={() => setPressed(false)} onMouseLeave={() => setPressed(false)} style={{ ...base, ...variants[variant], ...sx }}>{children}</button>;
}

function GlassCard({ children, style: sx, accent }) {
  return <div style={{ background: accent ? "linear-gradient(135deg,rgba(255,107,53,0.07),rgba(255,179,71,0.04))" : "var(--surface)", border: `1.5px solid ${accent ? "var(--border-accent)" : "var(--border)"}`, borderRadius: "var(--r-lg)", backdropFilter: "blur(14px)", boxShadow: accent ? "0 4px 24px rgba(255,107,53,0.10)" : "var(--sh-md)", padding: "20px", marginBottom: 10, ...sx }}>{children}</div>;
}

function InfoCard({ label, value, sub, icon, accent }) {
  return (
    <GlassCard accent={accent}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: 26, fontFamily: "var(--fh)", fontWeight: 700, color: accent ? "var(--accent)" : "var(--t1)", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 6, fontWeight: 500 }}>{sub}</div>}
    </GlassCard>
  );
}

function Alert({ type, title, children }) {
  const v = {
    success: { bg: "rgba(16,185,129,0.07)", border: "rgba(167,243,208,0.9)", tc: "#065F46", bc: "#047857", dot: "#10B981" },
    danger: { bg: "rgba(239,68,68,0.07)", border: "rgba(254,202,202,0.9)", tc: "#991B1B", bc: "#DC2626", dot: "#EF4444" },
    warning: { bg: "rgba(245,158,11,0.07)", border: "rgba(253,230,138,0.9)", tc: "#78350F", bc: "#92400E", dot: "#F59E0B" },
    info: { bg: "rgba(99,102,241,0.07)", border: "rgba(199,210,254,0.9)", tc: "#1E40AF", bc: "#3730A3", dot: "#6366F1" },
  }[type];
  return (
    <div style={{ padding: "13px 15px", background: v.bg, border: `1.5px solid ${v.border}`, borderRadius: "var(--r-md)", display: "flex", gap: 11, animation: "slideUp 0.3s ease" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: v.dot, flexShrink: 0, marginTop: 5 }} />
      <div>
        {title && <div style={{ fontSize: 13, fontWeight: 700, color: v.tc, fontFamily: "var(--fh)", marginBottom: 3 }}>{title}</div>}
        <div style={{ fontSize: 13, color: v.bc, fontWeight: 500, lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

function DumpingAlert({ cantonLabel, salaireHoraire, smicHoraire, tauxAct }) {
  return (
    <div style={{ padding: "18px 20px", background: "rgba(245,158,11,0.06)", border: "2px solid rgba(253,230,138,0.9)", borderRadius: "var(--r-lg)", marginBottom: 20, animation: "slideUp 0.35s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>⚠️</div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#92400E", fontFamily: "var(--fh)" }}>Salaire à vérifier</span>
      </div>
      <p style={{ fontSize: 13, color: "#78350F", lineHeight: 1.65, fontWeight: 500, margin: "0 0 8px" }}>
        À {tauxAct}% d'activité, votre taux horaire ({salaireHoraire.toFixed(2)} CHF/h) semble inférieur au salaire minimum de <strong>{cantonLabel}</strong> ({smicHoraire} CHF/h).
      </p>
      <p style={{ fontSize: 13, color: "#92400E", lineHeight: 1.65, fontWeight: 600, margin: 0 }}>
        À faire vérifier : un salaire sous le minimum cantonal peut poser problème pour l'autorisation de travail. Ce point mérite une analyse de votre contrat réel.
      </p>
    </div>
  );
}

// ─── LAYOUT ──────────────────────────────────────────────────────────────────

function Layout({ step, title, sub, children, totalSteps = 6 }) {
  const show = useMount();
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "28px 20px 48px", opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(18px)", transition: "all 0.52s cubic-bezier(0.16,1,0.3,1)" }}>
      <Progress step={step} total={totalSteps} />
      <div style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 26, fontFamily: "var(--fh)", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.02em", marginBottom: 7 }}>{title}</h2>
        <p style={{ fontSize: 15, color: "var(--t2)", lineHeight: 1.65 }}>{sub}</p>
      </div>
      {children}
    </div>
  );
}

// ─── SCREENS ─────────────────────────────────────────────────────────────────

function Accueil({ onStart }) {
  const show = useMount(80);
  const points = [
    { icon: "🧮", l: "Brut → net réel", sub: "cotisations, impôt, change" },
    { icon: "🏥", l: "LAMal vs CMU", sub: "comparées automatiquement" },
    { icon: "🏠", l: "Reste à vivre", sub: "loyer, courses, transport" },
  ];
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", top: -120, right: -100, width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,107,53,0.11) 0%,transparent 68%)", animation: "float 9s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: -100, left: -80, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(99,102,241,0.09) 0%,transparent 68%)", animation: "floatB 11s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ maxWidth: 440, opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(28px)", transition: "all 0.85s cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(10px)", borderRadius: 99, padding: "7px 14px 7px 8px", marginBottom: 28, border: "1.5px solid rgba(255,107,53,0.2)", boxShadow: "var(--sh-sm)" }}>
          <div style={{ background: "linear-gradient(135deg,#FF6B35,#FF8F5E)", borderRadius: 99, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: "0.07em", textTransform: "uppercase" }}>🇨🇭 Simulateur</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t2)" }}>Barèmes 2026</span>
        </div>
        <h1 style={{ fontSize: "clamp(32px,8vw,52px)", fontFamily: "var(--fh)", fontWeight: 700, color: "var(--t1)", lineHeight: 1.08, letterSpacing: "-0.025em", marginBottom: 20 }}>
          Votre vrai salaire<br />
          <span style={{ background: "linear-gradient(130deg,#FF6B35,#FF8F5E 50%,#FFB347)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>en Suisse</span>
        </h1>
        <p style={{ fontSize: 17, color: "var(--t2)", lineHeight: 1.72, maxWidth: 390, margin: "0 auto 36px" }}>
          Ne vous laissez pas aveugler par le brut. Calculez votre <strong style={{ color: "var(--t1)", fontWeight: 600 }}>reste à vivre réel</strong> après impôts, cotisations, conversion en euros et coût de la vie côté français.
        </p>
        <div style={{ marginBottom: 16, animation: "glowPulse 3.5s ease infinite" }}><Btn onClick={onStart}>Lancer mon estimation →</Btn></div>
        <p style={{ fontSize: 12, color: "var(--t3)", fontWeight: 500, marginBottom: 48 }}>Gratuit · 2 minutes · Zéro engagement</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {points.map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)", borderRadius: "var(--r-lg)", padding: "18px 10px", border: "1.5px solid rgba(255,255,255,0.95)", boxShadow: "var(--sh-md)", opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(14px)", transition: `all 0.7s cubic-bezier(0.16,1,0.3,1) ${0.18 + i * 0.1}s` }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{s.l}</div>
              <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 500, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step1({ data, setData, onNext }) {
  const tauxAct = data.tauxActivite || 100;
  const valid = data.salaire && data.canton && data.age;
  const cantonObj = CANTONS.find(c => c.id === data.canton);
  const smicHoraire = cantonObj?.smicHoraire || 0;
  const salaireHoraire = data.salaire ? (data.salaire / 12) / (173.33 * (tauxAct / 100)) : 0;
  const isDumping = data.salaire && cantonObj && smicHoraire > 0 && salaireHoraire > 0 && salaireHoraire < smicHoraire;

  return (
    <Layout step={0} title="Vos données professionnelles" sub="Indiquez votre salaire brut ANNUEL total (13e mois inclus si vous en avez un).">
      <Field label="Salaire brut annuel visé (toutes mensualités comprises)">
        <NumInput value={data.salaire} onChange={v => setData({ ...data, salaire: parseInt(v) || "" })} placeholder="ex : 95 000" suffix="CHF / an" />
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--t3)", fontWeight: 500, lineHeight: 1.5 }}>
          💡 Si on vous annonce un mensuel × 13, multipliez par 13. Ex : 7 300 CHF × 13 = 94 900 CHF/an.
        </div>
      </Field>
      <Field label="Canton de travail">
        <Chips options={CANTONS.map(c => ({ id: c.id, label: c.label }))} value={data.canton} onChange={v => setData({ ...data, canton: v })} columns="repeat(2,1fr)" />
      </Field>
      <Field label={`Taux d'activité — ${tauxAct}%`}>
        <div style={{ background: "rgba(255,255,255,0.82)", border: "1.5px solid var(--border)", borderRadius: "var(--r-md)", padding: "16px 18px", boxShadow: "var(--sh-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: "var(--t2)", fontWeight: 500 }}>Partiel</span>
            <div style={{ padding: "6px 14px", borderRadius: 99, background: "linear-gradient(135deg,#FF6B35,#FF8F5E)", fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "var(--fh)" }}>{tauxAct}%</div>
            <span style={{ fontSize: 13, color: "var(--t2)", fontWeight: 500 }}>Plein</span>
          </div>
          <RangeInput value={tauxAct} onChange={v => setData({ ...data, tauxActivite: v })} min={10} max={100} step={10} />
        </div>
      </Field>
      {isDumping && <DumpingAlert cantonLabel={cantonObj.label} salaireHoraire={salaireHoraire} smicHoraire={smicHoraire} tauxAct={tauxAct} />}
      <Field label="Votre âge">
        <NumInput value={data.age} onChange={v => setData({ ...data, age: parseInt(v) || "" })} placeholder="ex : 38" suffix="ans" />
        {data.age && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(99,102,241,0.06)", border: "1.5px solid rgba(199,210,254,0.7)", borderRadius: 10, fontSize: 13, color: "#3730A3", fontWeight: 500 }}>
            Taux LPP applicable : <strong style={{ color: "#6366F1" }}>{getLPPRate(data.age || 30) * 100}%</strong>
            {data.age < 25 && " (pas de LPP avant 25 ans)"}
          </div>
        )}
      </Field>
      <div style={{ marginTop: 28 }}><Btn onClick={valid ? onNext : null} disabled={!valid}>Continuer →</Btn></div>
    </Layout>
  );
}

function Step2({ data, setData, onNext }) {
  const valid = data.situation;
  const r = data.salaire ? computeResults(data) : null;
  return (
    <Layout step={1} title="Situation personnelle" sub="Ces paramètres changent votre barème fiscal et votre couverture santé.">
      <Field label="Situation familiale">
        <Chips options={SITUATIONS} value={data.situation} onChange={v => setData({ ...data, situation: v })} columns="1fr 1fr 1fr" />
      </Field>
      <Field label="Enfants à charge">
        <Chips options={ENFANTS_OPTS} value={data.enfants} onChange={v => setData({ ...data, enfants: parseInt(v) })} columns="repeat(4,1fr)" />
      </Field>
      <Field label="Jours de télétravail par semaine">
        <div style={{ background: "rgba(255,255,255,0.82)", border: "1.5px solid var(--border)", borderRadius: "var(--r-md)", padding: "16px 18px", boxShadow: "var(--sh-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: "var(--t2)", fontWeight: 500 }}>0j</span>
            <div style={{ padding: "6px 14px", borderRadius: 99, background: data.teletravail > 2 ? "linear-gradient(135deg,#EF4444,#DC2626)" : "linear-gradient(135deg,#FF6B35,#FF8F5E)", fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "var(--fh)" }}>{data.teletravail}j / sem</div>
            <span style={{ fontSize: 13, color: "var(--t2)", fontWeight: 500 }}>5j</span>
          </div>
          <RangeInput value={data.teletravail} onChange={v => setData({ ...data, teletravail: v })} min={0} max={5} />
        </div>
        {r && r.teleAlert === "safe" && <div style={{ marginTop: 10 }}><Alert type="success" title="Zone de neutralité fiscale">Jusqu'à 40% de télétravail, votre régime fiscal reste inchangé.</Alert></div>}
        {r && r.teleAlert === "danger" && <div style={{ marginTop: 10 }}><Alert type="danger" title="Risque de requalification">Au-delà de 40% de télétravail, une partie de l'impôt pourrait être due en France. À valider précisément.</Alert></div>}
      </Field>
      <div style={{ marginTop: 28 }}><Btn onClick={valid ? onNext : null} disabled={!valid}>Continuer →</Btn></div>
    </Layout>
  );
}

function Step3({ data, setData, onNext }) {
  const r = computeResults(data);
  const diff = r.cmuMensuel - r.lamalEUR;
  return (
    <Layout step={2} title="Le duel Santé 2026" sub="LAMal ou CMU ? Ce choix est irrévocable et peut valoir plusieurs milliers d'euros par an.">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { id: "lamal", label: "LAMal", price: r.lamalEUR, tag: "Prime fixe", detail: "selon canton, âge, foyer", flag: "🇨🇭" },
          { id: "cmu", label: "CMU — PUMa", price: r.cmuMensuel, tag: "8% du RFR", detail: `≈ ${fmtEUR(r.cmuAnnuel)} €/an, tout le foyer`, flag: "🇫🇷" },
        ].map(opt => {
          const active = data.sante === opt.id;
          const cheaper = opt.id === "lamal" ? diff > 0 : diff < 0;
          return (
            <button key={opt.id} onClick={() => setData({ ...data, sante: opt.id })}
              style={{ padding: "20px 14px", borderRadius: "var(--r-lg)", border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "linear-gradient(135deg,rgba(255,107,53,0.07),rgba(255,179,71,0.04))" : "rgba(255,255,255,0.82)", cursor: "pointer", textAlign: "center", transition: "all 0.22s cubic-bezier(0.34,1.56,0.64,1)", transform: active ? "translateY(-3px)" : "none", boxShadow: active ? "0 6px 24px rgba(255,107,53,0.15)" : "var(--sh-sm)", position: "relative" }}>
              {cheaper && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#10B981,#059669)", borderRadius: 99, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: "0.05em", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(16,185,129,0.3)" }}>MOINS CHER</div>}
              <div style={{ fontSize: 22, marginBottom: 6 }}>{opt.flag}</div>
              <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{opt.label}</div>
              <div style={{ fontSize: 30, fontFamily: "var(--fh)", fontWeight: 700, color: active ? "var(--accent)" : "var(--t1)", letterSpacing: "-0.02em" }}>{opt.price}</div>
              <div style={{ fontSize: 12, color: "var(--t3)", fontWeight: 500, marginBottom: 6 }}>€ / mois</div>
              <div style={{ display: "inline-block", padding: "3px 10px", background: "rgba(226,232,240,0.6)", borderRadius: 99, fontSize: 11, color: "var(--t2)", fontWeight: 600 }}>{opt.tag}</div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 5, fontWeight: 500 }}>{opt.detail}</div>
            </button>
          );
        })}
      </div>
      {data.sante && (
        <GlassCard style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 14, color: "var(--t2)", lineHeight: 1.65 }}>
            {data.sante === "lamal" ? (
              <><strong style={{ color: "var(--accent)" }}>LAMal :</strong> prime fixe indépendante du revenu, à payer par personne couverte.{diff > 0 && <> Vous économisez <strong style={{ color: "var(--success)" }}>{fmtEUR(diff * 12)} €/an</strong> vs la CMU.</>}</>
            ) : (
              <><strong style={{ color: "var(--accent)" }}>CMU (PUMa) :</strong> 8% du revenu fiscal de référence au-dessus de {fmtEUR(ABATTEMENT_CMU)} €, une seule cotisation pour tout le foyer.{diff < 0 ? <> Vous économisez <strong style={{ color: "var(--success)" }}>{fmtEUR(Math.abs(diff) * 12)} €/an</strong> vs la LAMal.</> : <> <span style={{ color: "var(--warning)", fontWeight: 600 }}>Plus chère que la LAMal à votre revenu.</span></>}</>
            )}
          </p>
        </GlassCard>
      )}
      <Btn onClick={data.sante ? onNext : null} disabled={!data.sante}>Voir mes résultats →</Btn>
    </Layout>
  );
}

function LeadCapture({ data, onSubmit }) {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState("");
  const show = useMount();

  const validEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isDisposable = email && validEmailFormat && isDisposableEmail(email);
  const validEmail = validEmailFormat && !isDisposable;
  const valid = prenom.trim().length > 1 && nom.trim().length > 1 && validEmail;

  const inputStyle = (name) => ({
    width: "100%", padding: "15px 16px",
    background: focusedField === name ? "#fff" : "rgba(255,255,255,0.82)",
    border: `2px solid ${focusedField === name ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "var(--r-md)", color: "var(--t1)", fontSize: 16, fontWeight: 600,
    fontFamily: "var(--fb)", outline: "none", transition: "all 0.22s ease",
    boxShadow: focusedField === name ? "0 0 0 4px rgba(255,107,53,0.10),var(--sh-md)" : "var(--sh-sm)",
    boxSizing: "border-box", backdropFilter: "blur(10px)",
  });

  const handleSubmit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError("");
    const r = computeResults({ ...data, prenom, nom, email });
    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, prenom, nom,
          salaire_brut: String(r.brut),
          canton: r.canton,
          regime: r.regime,
          net_mensuel: String(r.netMensuelEUR),
          sante_type: data.sante,
          sante_montant: String(r.assuranceEUR),
          lamal: String(r.lamalEUR),
          cmu: String(r.cmuMensuel),
          loyer: String(r.loyer),
          transport: String(r.transport),
          courses: String(r.courses),
          charges_totales: String(r.totalCharges),
          reste_a_vivre: String(r.resteAVivre),
          verdict: r.verdict,
          newsletter_optin: newsletter,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message || "Une erreur est survenue. Réessayez dans un instant.");
        setLoading(false);
        return;
      }
      onSubmit({ prenom, nom, email, emailSent: true });
    } catch {
      onSubmit({ prenom, nom, email, emailSent: false });
    } finally {
      setLoading(false);
    }
  };

  const perks = [
    { icon: "📊", text: "Estimation complète : cotisations, impôts, net mensuel" },
    { icon: "🏠", text: "Reste à vivre : loyer, transport, santé, courses inclus" },
    { icon: "🎯", text: "Verdict personnalisé + accès à la session stratégique 45 min" },
  ];

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "28px 20px 48px", opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(18px)", transition: "all 0.52s cubic-bezier(0.16,1,0.3,1)" }}>
      <Progress step={3} total={6} />
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ width: 68, height: 68, borderRadius: 20, margin: "0 auto 18px", background: "linear-gradient(135deg,rgba(255,107,53,0.12),rgba(255,179,71,0.08))", border: "1.5px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, boxShadow: "0 4px 20px rgba(255,107,53,0.12)" }}>🔐</div>
        <h2 style={{ fontSize: 24, fontFamily: "var(--fh)", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.02em", marginBottom: 8 }}>Débloquez votre estimation</h2>
        <p style={{ fontSize: 15, color: "var(--t2)", lineHeight: 1.65 }}>Vos résultats sont prêts. Entrez vos coordonnées pour y accéder.</p>
      </div>

      <GlassCard style={{ marginBottom: 24 }}>
        {perks.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: i < perks.length - 1 ? 14 : 0, marginBottom: i < perks.length - 1 ? 14 : 0, borderBottom: i < perks.length - 1 ? "1px solid rgba(226,232,240,0.6)" : "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: "rgba(255,107,53,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{p.icon}</div>
            <span style={{ fontSize: 14, color: "var(--t2)", fontWeight: 500, lineHeight: 1.55 }}>{p.text}</span>
          </div>
        ))}
      </GlassCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Prénom">
          <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Votre prénom" style={inputStyle("prenom")} onFocus={() => setFocusedField("prenom")} onBlur={() => setFocusedField("")} />
        </Field>
        <Field label="Nom">
          <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Votre nom" style={inputStyle("nom")} onFocus={() => setFocusedField("nom")} onBlur={() => setFocusedField("")} />
        </Field>
      </div>

      <Field label="Adresse e-mail">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom.nom@email.com" style={inputStyle("email")} onFocus={() => setFocusedField("email")} onBlur={() => setFocusedField("")} />
        {isDisposable && (
          <div style={{ marginTop: 8, padding: "10px 13px", background: "rgba(239,68,68,0.07)", border: "1.5px solid rgba(254,202,202,0.8)", borderRadius: 10, fontSize: 13, color: "#DC2626", fontWeight: 500, display: "flex", gap: 8 }}>
            <span>⚠️</span><span>Les adresses jetables ne sont pas acceptées. Utilisez Gmail, Outlook, iCloud…</span>
          </div>
        )}
      </Field>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", background: "rgba(255,255,255,0.82)", border: "1.5px solid var(--border)", borderRadius: "var(--r-md)", marginBottom: 18, cursor: "pointer", boxShadow: "var(--sh-sm)" }}>
        <input type="checkbox" checked={newsletter} onChange={e => setNewsletter(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--accent)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "var(--t2)", fontWeight: 500, lineHeight: 1.55 }}>
          Je souhaite recevoir les conseils exclusifs de Raphaël pour réussir mon projet frontalier (1 email/semaine, désinscription en 1 clic).
        </span>
      </label>

      <Btn onClick={handleSubmit} disabled={!valid || loading}>
        {loading ? <div style={{ width: 20, height: 20, border: "2.5px solid rgba(255,255,255,0.35)", borderTop: "2.5px solid white", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} /> : "Voir mes résultats →"}
      </Btn>

      {error && <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(239,68,68,0.07)", border: "1.5px solid rgba(254,202,202,0.8)", borderRadius: 12, color: "#DC2626", fontSize: 13, fontWeight: 500, textAlign: "center" }}>{error}</div>}

      <div style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: "var(--t3)", fontWeight: 500 }}>🔒 Données confidentielles · Zéro spam</div>
    </div>
  );
}

function Results({ data, onNext, emailSent }) {
  const r = computeResults(data);
  const show = useMount(150);
  const taxNote = { source: { bg: "rgba(16,185,129,0.06)", border: "rgba(167,243,208,0.8)", c: "#065F46", icon: "✅" }, france: { bg: "rgba(245,158,11,0.06)", border: "rgba(253,230,138,0.8)", c: "#78350F", icon: "ℹ️" } }[r.regime];

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "28px 20px 48px", opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(16px)", transition: "all 0.55s cubic-bezier(0.16,1,0.3,1)" }}>
      <Progress step={4} total={6} />
      {emailSent && (
        <div style={{ padding: "13px 16px", marginBottom: 20, background: "rgba(16,185,129,0.07)", border: "1.5px solid rgba(167,243,208,0.9)", borderRadius: "var(--r-md)", display: "flex", gap: 10, animation: "slideUp 0.4s ease" }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>📧</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#065F46", fontFamily: "var(--fh)", marginBottom: 2 }}>Résultats envoyés par email</div>
            <div style={{ fontSize: 13, color: "#047857", lineHeight: 1.5 }}>Vérifiez vos spams si besoin, et marquez le message comme « non-spam » pour ne rien manquer.</div>
          </div>
        </div>
      )}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "inline-block", padding: "6px 16px", background: "linear-gradient(135deg,rgba(255,107,53,0.1),rgba(255,179,71,0.06))", border: "1.5px solid var(--border-accent)", borderRadius: 99, fontSize: 12, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10, animation: "badgePop 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>Votre estimation</div>
        <h2 style={{ fontSize: 24, fontFamily: "var(--fh)", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.02em" }}>Analyse détaillée</h2>
      </div>

      <InfoCard label="Salaire brut annuel" value={`${fmtCHF(r.brut)} CHF`} icon="💼" sub={`Taux de change utilisé : 1 CHF = ${r.tauxChange} €`} />

      <GlassCard>
        <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 14 }}>Cotisations sociales suisses</div>
        {[
          { l: "AVS / AI / APG (5,3%)", v: r.avs },
          { l: "Assurance chômage (1,1%)", v: r.ac },
          { l: "Accidents non prof. (1,5%)", v: r.aanp },
          { l: `LPP 2e pilier (${r.lppRate}%)`, v: r.lpp },
        ].map(item => (
          <div key={item.l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
            <span style={{ color: "var(--t2)" }}>{item.l}</span>
            <span style={{ color: "var(--danger)", fontWeight: 700 }}>−{fmtCHF(item.v)}</span>
          </div>
        ))}
        <div style={{ borderTop: "1.5px solid rgba(226,232,240,0.7)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
          <span style={{ color: "var(--t2)" }}>Net social (avant impôt)</span>
          <span style={{ color: "var(--t1)", fontFamily: "var(--fh)" }}>{fmtCHF(r.netSocial)} CHF</span>
        </div>
      </GlassCard>

      <InfoCard
        label={`Impôt — ${r.canton}`}
        value={r.regime === "france" ? `≈ ${fmtEUR(r.impotEUR)} € / an` : `−${fmtCHF(r.impotCHF)} CHF / an`}
        icon="🏛"
        sub={r.regime === "source" ? `Prélevé en Suisse · taux effectif ${r.tauxIS}%` : `Payé en France (accord 1983) · taux moyen ${r.tauxIS}% · à provisionner`}
      />
      <div style={{ padding: "13px 15px", marginBottom: 10, background: taxNote.bg, border: `1.5px solid ${taxNote.border}`, borderRadius: "var(--r-md)", display: "flex", gap: 10 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{taxNote.icon}</span>
        <p style={{ fontSize: 13, color: taxNote.c, margin: 0, lineHeight: 1.6 }}><strong>Note fiscale :</strong> {r.noteFiscale}</p>
      </div>

      <div style={{ padding: "24px 20px", borderRadius: "var(--r-xl)", background: "linear-gradient(135deg,rgba(255,107,53,0.09),rgba(255,179,71,0.05))", border: "2px solid var(--border-accent)", textAlign: "center", marginBottom: 10, boxShadow: "0 6px 32px rgba(255,107,53,0.12)" }}>
        <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>🎯 Net mensuel après impôt, en euros</div>
        <div style={{ fontSize: 42, fontFamily: "var(--fh)", fontWeight: 700, color: "var(--accent)", letterSpacing: "-0.03em", animation: "countReveal 0.6s cubic-bezier(0.16,1,0.3,1)" }}>{fmtEUR(r.netMensuelEUR)} €</div>
        <div style={{ fontSize: 13, color: "var(--t2)", marginTop: 6 }}>≈ {fmtCHF(r.netMensuelCHF)} CHF en poche avant impôt · avant charges fixes</div>
      </div>

      <div style={{ marginTop: 28 }}><Btn onClick={onNext}>Voir mon reste à vivre complet →</Btn></div>
    </div>
  );
}

function Final({ data }) {
  const r = computeResults(data);
  const show = useMount(150);
  const animatedRAV = useCountUp(r.resteAVivre, show);
  const vc = {
    rouge: { bg: "rgba(239,68,68,0.07)", border: "rgba(254,202,202,0.9)", accent: "#DC2626", icon: "🔴", heroGrad: "linear-gradient(135deg,rgba(239,68,68,0.1),rgba(239,68,68,0.05))", shadow: "0 8px 40px rgba(239,68,68,0.20)", textC: "#991B1B" },
    orange: { bg: "rgba(245,158,11,0.07)", border: "rgba(253,230,138,0.9)", accent: "#D97706", icon: "🟡", heroGrad: "linear-gradient(135deg,rgba(245,158,11,0.1),rgba(245,158,11,0.05))", shadow: "0 8px 40px rgba(245,158,11,0.20)", textC: "#78350F" },
    vert: { bg: "rgba(16,185,129,0.07)", border: "rgba(167,243,208,0.9)", accent: "#059669", icon: "🟢", heroGrad: "linear-gradient(135deg,rgba(16,185,129,0.10),rgba(16,185,129,0.05))", shadow: "0 8px 40px rgba(16,185,129,0.20)", textC: "#065F46" },
  }[r.verdict];
  const needsCTA = r.verdict === "rouge" || r.verdict === "orange";
  const breakdown = [
    { l: "Net mensuel (après impôt, €)", v: r.netMensuelEUR, color: "var(--t1)", sign: "" },
    { l: "Loyer", v: r.loyer, color: "var(--danger)", sign: "−" },
    { l: "Transport frontalier", v: r.transport, color: "#F97316", sign: "−" },
    { l: "Courses / alimentation", v: r.courses, color: "#EAB308", sign: "−" },
    { l: `Santé (${data.sante === "lamal" ? "LAMal" : "CMU"})`, v: r.assuranceEUR, color: "#8B5CF6", sign: "−" },
  ];
  const ctaVariant = r.verdict === "rouge" ? "danger" : r.verdict === "orange" ? "warning" : "primary";
  const ctaLabel = needsCTA ? "🛡 Sécuriser mon budget avec Raphaël — 45 min" : "🗓 Réserver ma session stratégique — 45 min";

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "28px 20px 56px", opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(20px)", transition: "all 0.6s cubic-bezier(0.16,1,0.3,1)" }}>
      <Progress step={5} total={6} />
      {r.isDumping && <DumpingAlert cantonLabel={r.canton} salaireHoraire={r.salaireHoraire} smicHoraire={r.smicHoraire} tauxAct={r.tauxActivite} />}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: 22, margin: "0 auto 16px", background: vc.heroGrad, border: `2px solid ${vc.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, boxShadow: vc.shadow, animation: "badgePop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.2s both" }}>{vc.icon}</div>
        <div style={{ display: "inline-block", padding: "7px 18px", background: vc.bg, border: `1.5px solid ${vc.border}`, borderRadius: 99, fontSize: 13, fontWeight: 700, color: vc.accent, fontFamily: "var(--fh)", marginBottom: 10, animation: "badgePop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s both" }}>{r.verdictLabel}</div>
        <h2 style={{ fontSize: 22, fontFamily: "var(--fh)", fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.02em" }}>Votre projet frontalier</h2>
      </div>

      <div style={{ padding: "28px 20px 24px", borderRadius: "var(--r-xl)", background: vc.heroGrad, border: `2px solid ${vc.border}`, textAlign: "center", marginBottom: 12, boxShadow: vc.shadow, animation: "glowPulse 4s ease infinite" }}>
        <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>Reste à vivre estimé</div>
        <div style={{ fontSize: 52, fontFamily: "var(--fh)", fontWeight: 700, color: vc.accent, letterSpacing: "-0.03em", lineHeight: 1, animation: "countReveal 0.7s cubic-bezier(0.16,1,0.3,1) 0.4s both" }}>{show ? fmtEUR(animatedRAV) : "—"} €</div>
        <div style={{ fontSize: 14, color: "var(--t2)", marginTop: 8 }}>par mois, après toutes charges</div>
        {r.gainPct > 0 && <div style={{ marginTop: 16, display: "inline-block", padding: "8px 20px", background: "rgba(16,185,129,0.12)", border: "1.5px solid rgba(167,243,208,0.8)", borderRadius: 99, fontSize: 15, fontFamily: "var(--fh)", fontWeight: 700, color: "#059669" }}>+{r.gainPct}% vs un salaire français équivalent</div>}
      </div>

      <div style={{ padding: "16px 18px", marginBottom: 12, background: vc.bg, border: `1.5px solid ${vc.border}`, borderRadius: "var(--r-lg)" }}>
        <p style={{ fontSize: 14, color: vc.textC, lineHeight: 1.7, fontWeight: 500, margin: 0 }}>{r.verdictMsg}</p>
      </div>

      <GlassCard style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 16 }}>Décomposition mensuelle (en euros)</div>
        {breakdown.map((item, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 13, color: "var(--t2)", fontWeight: i === 0 ? 700 : 500 }}>{item.sign}{item.l}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? "var(--t1)" : item.color, fontFamily: "var(--fh)" }}>{item.sign}{fmtEUR(item.v)} €</span>
            </div>
            {i > 0 && <div style={{ height: 5, borderRadius: 99, background: "rgba(226,232,240,0.6)", overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.max(2, Math.min(100, (item.v / r.netMensuelEUR) * 100))}%`, background: item.color, borderRadius: 99, transformOrigin: "left", animation: `barGrow 0.7s cubic-bezier(0.34,1.56,0.64,1) ${0.5 + i * 0.08}s both` }} /></div>}
          </div>
        ))}
        <div style={{ borderTop: "1.5px solid rgba(226,232,240,0.7)", marginTop: 10, paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700 }}>
          <span style={{ color: vc.accent, fontFamily: "var(--fh)" }}>= Reste à vivre</span>
          <span style={{ color: vc.accent, fontFamily: "var(--fh)" }}>{fmtEUR(r.resteAVivre)} €</span>
        </div>
      </GlassCard>

      <GlassCard style={{ marginBottom: 20 }}>
        {needsCTA ? (
          <>
            <p style={{ fontSize: 14, color: "var(--t1)", lineHeight: 1.7, fontWeight: 500, margin: "0 0 10px" }}>
              <strong style={{ color: vc.accent }}>Votre budget est {r.verdict === "rouge" ? "trop serré" : "fragile"}.</strong> Avant de vous lancer, identifiez les leviers pour optimiser chaque poste (santé, négociation salariale, choix du lieu de résidence).
            </p>
            <p style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.6, margin: 0 }}>En 45 min, on définit la stratégie concrète pour maximiser votre reste à vivre.</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "var(--t1)", lineHeight: 1.7, fontWeight: 500, margin: "0 0 10px" }}>
              <strong style={{ color: "var(--accent)" }}>Mais attention :</strong> la théorie ne remplace pas la stratégie. Le marché caché suisse ne s'ouvre qu'aux profils bien préparés.
            </p>
            <p style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.6, margin: 0 }}>En 45 min, j'analyse votre éligibilité réelle, votre stratégie de négociation et la viabilité de votre projet.</p>
          </>
        )}
      </GlassCard>

      <a href="https://calendly.com/esprraphael/strategie-de-reussite-en-tant-que-frontalier-suisse" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>
        <Btn variant={ctaVariant}>{ctaLabel}</Btn>
      </a>

      <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(255,255,255,0.7)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", fontSize: 11, color: "var(--t3)", lineHeight: 1.6 }}>
        ⚠️ <strong>Estimation indicative.</strong> Les chiffres reposent sur des moyennes 2026 (cotisations, primes LAMal, barèmes fiscaux, taux de change 1,07) et peuvent s'écarter de votre situation réelle de ±10-15%. La LPP surobligatoire, votre prime LAMal exacte et votre impôt dépendent de votre cas précis. Ceci ne remplace pas un conseil fiscal personnalisé.
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("accueil");
  const [emailSent, setEmailSent] = useState(false);
  const [data, setData] = useState({ salaire: "", canton: "", age: "", situation: "", enfants: 0, teletravail: 0, tauxActivite: 100, sante: "", prenom: "", nom: "", email: "" });
  const flow = ["accueil", "step1", "step2", "step3", "leadcapture", "results", "final"];
  const goTo = (s) => { setScreen(s); window.scrollTo?.({ top: 0, behavior: "smooth" }); };

  return (
    <>
      <style>{CSS}</style>
      <div style={{ position: "fixed", top: -120, right: -100, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,107,53,0.09) 0%,transparent 70%)", animation: "float 9s ease-in-out infinite", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: -100, left: -80, width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle,rgba(99,102,241,0.08) 0%,transparent 70%)", animation: "floatB 12s ease-in-out infinite", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
        {screen !== "accueil" && (
          <div style={{ position: "sticky", top: 0, zIndex: 100, padding: "12px 20px", background: "rgba(240,244,255,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(226,232,240,0.6)", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 12px rgba(0,0,0,0.04)" }}>
            <button onClick={() => { const idx = flow.indexOf(screen); if (idx > 0) goTo(flow[idx - 1]); }} style={{ background: "rgba(255,255,255,0.9)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, boxShadow: "var(--sh-sm)" }}>← Retour</button>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "var(--t2)", fontFamily: "var(--fh)" }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(135deg,#FF6B35,#FF8F5E)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🇨🇭</div>
              Simulateur 2026
            </div>
          </div>
        )}
        {screen === "accueil" && <Accueil onStart={() => goTo("step1")} />}
        {screen === "step1" && <Step1 data={data} setData={setData} onNext={() => goTo("step2")} />}
        {screen === "step2" && <Step2 data={data} setData={setData} onNext={() => goTo("step3")} />}
        {screen === "step3" && <Step3 data={data} setData={setData} onNext={() => goTo("leadcapture")} />}
        {screen === "leadcapture" && (
          <LeadCapture
            data={data}
            onSubmit={({ prenom, nom, email, emailSent: es }) => {
              setData({ ...data, prenom, nom, email });
              setEmailSent(es);
              goTo("results");
            }}
          />
        )}
        {screen === "results" && <Results data={data} emailSent={emailSent} onNext={() => goTo("final")} />}
        {screen === "final" && <Final data={data} />}
      </div>
    </>
  );
}

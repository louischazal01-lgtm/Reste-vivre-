# Simulateur Reste à Vivre Frontalier Suisse 2026

## 🚀 Installation locale

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer en local
npm run dev
# → http://localhost:5173
```

**Note** : en local, l'appel à `/api/lead` ne fonctionnera pas (l'API Brevo est une fonction serverless Vercel, elle ne tourne qu'en prod). Ce n'est pas grave pour tester le front — le formulaire passera quand même à l'écran suivant grâce au fallback.

## 📦 Déploiement Vercel

### 1. Push sur GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TON_USER/reste-a-vivre-simulateur.git
git push -u origin main
```

### 2. Connecter à Vercel

1. Va sur [vercel.com](https://vercel.com)
2. Sign up avec GitHub
3. **Add New → Project** → sélectionne le repo
4. Framework : Vite (détecté automatiquement)
5. Clique **Deploy**

### 3. Ajouter la variable d'environnement Brevo

Dans Vercel → ton projet → **Settings → Environment Variables** :

- **Key** : `BREVO_API_KEY`
- **Value** : ta clé API Brevo (xkeysib-...)
- **Environments** : cocher les 3 (Production, Preview, Development)

### 4. Redéployer

Onglet **Deployments** → dernier deploy → `...` → **Redeploy**
(Indispensable pour que la var d'env soit prise en compte.)

## 🧪 Test en production

1. Ouvre ton URL Vercel (ex: `https://reste-a-vivre.vercel.app`)
2. Remplis la simu avec ton propre email
3. Au moment du lead capture, tu dois :
   - Passer à l'écran résultats
   - Recevoir l'email avec les résultats dans 30 sec
   - Voir le nouveau contact dans Brevo → Contacts → liste "Frontaliers - Simulateur"

## 🔧 Configuration Brevo actuelle

- **List ID** : 3 (Frontaliers - Simulateur)
- **Template ID** : 1 (Résultat simulation Reste à Vivre)

Pour changer ces valeurs, édite `api/lead.js` aux lignes `LIST_ID` et `TEMPLATE_ID`.

## 📁 Structure

```
reste-a-vivre/
├── api/
│   └── lead.js          ← Fonction serverless Brevo
├── src/
│   ├── App.jsx          ← Simulateur complet
│   └── main.jsx         ← Point d'entrée React
├── public/
├── index.html
├── package.json
├── vite.config.js
└── .gitignore
```

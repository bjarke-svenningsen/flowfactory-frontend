# 🚂 Railway Deployment Guide - FlowFactory Portal

## 📋 Hvad Du Skal Bruge:
- ✅ Railway konto (gratis $5/måned kredit)
- ✅ GitHub konto
- ✅ Netlify/Vercel konto (til frontend)
- ✅ Kreditkort (bruges IKKE med gratis kredit)

---

## 🎯 STEP 1: Opret Railway Konto

### 1.1 Gå til Railway
👉 https://railway.app/

### 1.2 Sign Up
- Klik "Login"
- Vælg "Login with GitHub"
- Autoriser Railway

### 1.3 Tilføj Kreditkort (Optional men anbefalet)
- Gå til Settings
- Add Payment Method
- Du får $5 gratis kredit hver måned!

---

## 🎯 STEP 2: Deploy Backend til Railway

### 2.1 Opret Nyt Project
1. Klik "New Project"
2. Vælg "Deploy from GitHub repo"
3. Connect GitHub (hvis ikke allerede gjort)

### 2.2 Push Kode til GitHub

**I VS Code terminal:**

```bash
# Initialiser git i backend folder
cd backend/breeze-portal-backend
git init

# Tilføj filer
git add .

# Commit
git commit -m "Initial commit"

# Opret GitHub repo (gå til github.com og lav nyt repo: flowfactory-backend)

# Push til GitHub
git remote add origin https://github.com/DIT-BRUGERNAVN/flowfactory-backend.git
git branch -M main
git push -u origin main
```

### 2.3 Deploy på Railway
1. Vælg dit GitHub repo: `flowfactory-backend`
2. Railway starter automatisk deployment
3. Vent 2-3 minutter

### 2.4 Tilføj Environment Variables
1. Klik på dit deployed project
2. Klik på "Variables" tab
3. Tilføj følgende variabler:

```
PORT=4000
JWT_SECRET=din-super-hemmelige-nøgle-her-skift-den
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=flowfactory.denmark@gmail.com
EMAIL_PASS=ftqsctwjktjfyugm
EMAIL_FROM=FlowFactory Portal <flowfactory.denmark@gmail.com>
GOOGLE_DRIVE_FOLDER_ID=1Bpmw6QNt6blnzL-T7sVtbz7kgVgKQQX1
```

4. Klik "Save"
5. Deployment genstarter automatisk

### 2.5 Få Din Backend URL
1. Gå til "Settings" tab
2. Find "Public Networking"
3. Klik "Generate Domain"
4. Du får en URL som: `flowfactory-backend-production.up.railway.app`
5. **KOPIER DENNE URL!** ✅

---

## 🎯 STEP 3: Deploy Frontend til Netlify

### 3.1 Opret Netlify Konto
👉 https://www.netlify.com/
- Sign up med GitHub

### 3.2 Forbered Frontend
**I VS Code, åbn `js/api.js`:**

Find:
```javascript
const API_URL = 'http://localhost:4000';
```

Skift til:
```javascript
const API_URL = 'https://DIN-RAILWAY-URL.railway.app';
```

### 3.3 Push Frontend til GitHub
```bash
# I hovedmappen (Virksomhedsportal)
git init
git add .
git commit -m "Initial commit"

# Opret GitHub repo: flowfactory-frontend
git remote add origin https://github.com/DIT-BRUGERNAVN/flowfactory-frontend.git
git branch -M main
git push -u origin main
```

### 3.4 Deploy på Netlify
1. Gå til Netlify Dashboard
2. Klik "Add new site" → "Import an existing project"
3. Vælg GitHub
4. Vælg `flowfactory-frontend` repo
5. **Build settings:**
   - Build command: (lad være tom)
   - Publish directory: `/` (roden)
6. Klik "Deploy site"
7. Vent 1-2 minutter

### 3.5 Opdater Site Name
1. Site settings
2. Change site name
3. Vælg: `flowfactory-portal` (eller dit ønskede navn)
4. Din URL bliver: `flowfactory-portal.netlify.app`

---

## 🎯 STEP 4: Opdater URLs i Koden

### 4.1 Opdater Backend URL i ALLE Frontend Filer

**Filer der skal opdateres:**

1. **js/api.js** - Hovedfilen
2. **js/login.js** - Login funktionalitet
3. **js/feed.js** - Feed funktionalitet
4. **js/chat.js** - Chat funktionalitet
5. **js/files.js** eller **js/files-real.js** - Fil funktionalitet
6. **js/colleagues.js** - Kollega funktionalitet
7. **dashboard.html** - Admin funktioner

**Find og erstat:**
```javascript
http://localhost:4000
```

**Med:**
```javascript
https://flowfactory-backend-production.up.railway.app
```

### 4.2 Opdater Email Registration URL

I `backend/breeze-portal-backend/server.js`, find:
```javascript
const registrationUrl = `http://localhost:3000/register.html?code=${code}`;
```

Skift til:
```javascript
const registrationUrl = `https://flowfactory-portal.netlify.app/register.html?code=${code}`;
```

Commit og push ændringerne!

---

## 🎯 STEP 5: Opret Admin Bruger

### 5.1 SSH til Railway (Midlertidig Database)
⚠️ **VIGTIGT:** Railway SQLite database resets ved hver deploy!

For permanent database, brug Railway PostgreSQL plugin.

### 5.2 Opret Admin via API
**Brug Postman eller direkte i browseren:**

```
POST https://DIN-RAILWAY-URL.railway.app/api/admin/create-admin
Body: {
  "name": "Admin Navn",
  "email": "admin@firma.dk",
  "password": "admin123"
}
```

---

## 🎯 STEP 6: Test Hele Systemet

### 6.1 Åbn Portalen
👉 https://flowfactory-portal.netlify.app

### 6.2 Log Ind
- Email: din admin email
- Password: din admin password

### 6.3 Send Email Invitation
1. Gå til Admin Panel
2. Klik "📧 Send Email Invitation"
3. Indtast din kammerats email
4. Email sendes! ✅

### 6.4 Din Kammerat Registrerer
1. Han modtager email
2. Klikker på link eller indtaster kode
3. Opretter konto
4. Logger ind!

---

## 🎉 DONE! Portalen Er Online!

**Backend URL:** https://flowfactory-backend-production.up.railway.app
**Frontend URL:** https://flowfactory-portal.netlify.app

---

## ⚠️ Vigtige Noter:

### Database Backup
Railway SQLite resets ved deploy. For permanent database:
1. Gå til Railway project
2. Klik "New" → "Database" → "Add PostgreSQL"
3. Opdater server.js til at bruge PostgreSQL

### Monitoring
- Railway dashboard viser logs og metrics
- Gratis tier: $5 kredit/måned
- Monitor dit forbrug!

### Custom Domain (Optional)
1. Køb domain (fx hos Namecheap)
2. I Netlify: Settings → Domain management → Add domain
3. I Railway: Settings → Public Networking → Add domain

---

## 🆘 Troubleshooting

### Backend virker ikke:
- Tjek Railway logs
- Tjek environment variables
- Tjek at PORT er sat til 4000

### Frontend kan ikke forbinde:
- Tjek at API_URL er opdateret i ALLE filer
- Tjek CORS settings i backend

### Email virker ikke:
- Tjek Gmail App Password
- Tjek environment variables

---

## 📞 Support
Hvis du støder på problemer, kontakt mig i chatten! 🚀

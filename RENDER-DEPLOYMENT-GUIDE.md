# 🚀 Render Deployment Guide - Simpel & Nem

## ✅ STATUS LIGE NU:
- ✅ Backend virker perfekt lokalt med Supabase
- ✅ Database: Supabase PostgreSQL
- ✅ Frontend: Netlify
- ❌ Backend hosting: Skal deployes til Render

---

## 📋 TRIN 1: OPRET RENDER KONTO (2 Minutter)

1. Gå til: **https://render.com**
2. Klik **"Get Started for Free"**
3. Vælg **"Sign up with GitHub"** (nemmest!)
4. Godkend Render adgang til din GitHub

---

## 📋 TRIN 2: DEPLOY BACKEND (5 Minutter)

### 1. Klik "New +" → "Web Service"

### 2. Connect GitHub Repository:
- Vælg: **flowfactory-frontend**
- Klik **"Connect"**

### 3. Konfigurer Service:
- **Name:** `flowfactory-backend`
- **Region:** `Frankfurt (EU Central)`
- **Branch:** `main`
- **Root Directory:** `backend/breeze-portal-backend`
- **Runtime:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Instance Type:** `Free`

### 4. Tilføj Environment Variables:
Klik **"Add Environment Variable"** og tilføj:

```
DATABASE_URL=postgresql://postgres.sggdtvbkvcuufurssklb:Olineersej123@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

JWT_SECRET=breeze-secret-key-2024

PORT=4000
```

### 5. Klik "Create Web Service"

**Render vil nu:**
- ✅ Clone dit GitHub repo
- ✅ Install dependencies
- ✅ Start backend
- ✅ Tildele en offentlig URL

---

## 📋 TRIN 3: FÅ BACKEND URL (1 Minut)

**Efter deployment (2-3 minutter):**

1. Find **URL** øverst (f.eks. `https://flowfactory-backend.onrender.com`)
2. **KOPIER** denne URL!

---

## 📋 TRIN 4: OPDATER FRONTEND (Jeg gør det!)

Jeg opdaterer `js/api.js` til at bruge din nye Render URL.

---

## 📋 TRIN 5: TEST (2 Minutter)

1. Gå til: **https://flowfactory-denmark.netlify.app**
2. **Login**
3. **Tjek Feed** - skal vise rigtige data (ikke dummy!)
4. **Tjek Quotes** - skal virke
5. **Tjek Chat** - skal virke

---

## ✅ DONE! 🎉

**Din finale setup:**
- 🖥️ **Backend:** Render
- 📊 **Database:** Supabase
- 🌐 **Frontend:** Netlify

**Ingen Railway, ingen problemer!**

---

## 🆘 HVIS NOGET FEJLER:

**Render deployment logs viser fejl:**
1. Gå til Render dashboard
2. Klik på dit service
3. Klik "Logs" tab
4. Kopier fejlmeddelelsen til mig

**Frontend viser stadig dummy data:**
1. Tjek at Render URL er korrekt i `js/api.js`
2. Tjek Render logs for fejl
3. Send mig logs

---

## 📞 SUPPORT:

Skriv til mig hvis:
- ❌ Render deployment fejler
- ❌ Frontend kan ikke connecte
- ❌ Data vises ikke korrekt

**Vi får det til at virke! 🚀**

# 🚀 Deployment Guide - FlowFactory Portal

## ✅ Hvad er gjort:

### URLs Opdateret:
- **Backend:** `https://flowfactory-backend-production.up.railway.app`
- **Frontend:** `https://flowfactory-denmark.netlify.app`
- **Antal ændringer:** 117 URLs opdateret i 17 filer

### Filer der er opdateret:
- ✅ `js/api.js` - Hovedkonfiguration
- ✅ `js/login.js`, `js/feed.js`, `js/chat.js`, `js/colleagues.js`, `js/profile.js`
- ✅ `js/files-real.js` - Filhåndtering
- ✅ `js/quotes.js` + alle quotes moduler
- ✅ `js/videocall.js`
- ✅ `js/admin.js`
- ✅ `backend/breeze-portal-backend/server.js` - Email registration URL

---

## 🎯 Næste Trin - Deployment

### TRIN 1: Commit og Push Ændringer

```bash
# Se alle ændringer
git status

# Add alle ændrede filer
git add .

# Commit med beskrivelse
git commit -m "Update URLs for production deployment - 117 URLs opdateret"

# Push til GitHub
git push origin main
```

**VIGTIGT:** Både frontend og backend bruger samme repository lige nu. Det er fint for hurtig deployment!

---

### TRIN 2: Netlify Auto-Deploy (Frontend)

**Netlify opdaterer automatisk når du pusher til GitHub!**

1. Gå til [netlify.com](https://netlify.com) og log ind
2. Klik på dit site: `flowfactory-denmark`
3. Du skulle se en ny deployment starte automatisk
4. Vent 1-2 minutter
5. Test din portal: `https://flowfactory-denmark.netlify.app`

---

### TRIN 3: Railway Auto-Deploy (Backend)

**Railway opdaterer også automatisk når du pusher til GitHub!**

1. Gå til [railway.app](https://railway.app) og log ind
2. Klik på dit backend projekt
3. Du skulle se en ny deployment starte automatisk
4. Vent 2-3 minutter

---

## ⚠️ VIGTIGT: Database Problem

**SQLite på Railway resetter ved hver deploy!**

### Problem:
- Nuværende setup: SQLite database
- Problem: Railway filestorage er midlertidig
- Resultat: Database slettes hver gang backend redeploy'es

### Løsning: Skift til PostgreSQL

```bash
# Kør PostgreSQL migration script (laver jeg til dig)
node migrate-to-postgres.js
```

**ELLER** accepter at database resettet ved hver backend deploy (midlertidig løsning).

---

## 🧪 Test Din Deployment

### 1. Test Backend

Åbn i browser:
```
https://flowfactory-backend-production.up.railway.app/
```

Du skulle se:
```json
{"ok":true,"message":"Breeze API kører!"}
```

### 2. Test Frontend

Åbn i browser:
```
https://flowfactory-denmark.netlify.app
```

Du skulle se login siden!

### 3. Test Login

Prøv at logge ind med din admin bruger.

**Hvis det virker ikke:**
- Tjek browser console (F12) for fejl
- Tjek Railway logs for backend fejl

---

## 🐛 Troubleshooting

### Problem: Frontend kan ikke forbinde til backend

**Løsning:**
1. Åbn browser console (F12)
2. Se fejlbeskeden
3. Tjek om Railway backend kører: `https://flowfactory-backend-production.up.railway.app/`

### Problem: Backend returnerer 500 error

**Løsning:**
1. Gå til Railway dashboard
2. Klik på dit projekt → **Deployments**
3. Klik på den nyeste deployment
4. Klik **View Logs**
5. Find fejlen i logs

### Problem: Database tom efter deploy

**Løsning:**
Dette er forventet med SQLite på Railway. Skift til PostgreSQL (se nedenfor).

---

## 🔄 PostgreSQL Migration (Anbefalet)

### Hvorfor PostgreSQL?
- ✅ Persistent database (overlever redeploys)
- ✅ Gratis på Railway
- ✅ Bedre performance
- ✅ Production-ready

### Sådan gør du:

**1. Tilføj PostgreSQL på Railway:**
1. Gå til dit Railway projekt
2. Klik **"New"** → **"Database"** → **"Add PostgreSQL"**
3. Railway tilføjer automatisk `DATABASE_URL` environment variable

**2. Opdater database konfiguration:**

Jeg laver et script til dig der automatisk:
- Konverterer SQLite til PostgreSQL
- Migrerer eksisterende data
- Opdaterer connection strings

---

## 📝 Næste Opgaver

### Must-Have:
- [ ] Commit og push ændringer til GitHub
- [ ] Test at portalen virker online
- [ ] Skift til PostgreSQL database

### Nice-to-Have:
- [ ] Tilføj custom domain (køb eget domæne)
- [ ] Setup email notifications
- [ ] Backup rutine for database

---

## 🎉 Når Alt Virker

Din portal er nu online på:
- **Frontend:** https://flowfactory-denmark.netlify.app
- **Backend:** https://flowfactory-backend-production.up.railway.app

### Next Steps:
1. Inviter brugere via Admin Panel
2. Upload filer og billeder
3. Brug portalen! 🚀

---

## 📞 Support

Hvis du støder på problemer:
1. Tjek Railway logs
2. Tjek Netlify deploy logs
3. Tjek browser console (F12)
4. Spørg i chatten!

God fornøjelse med din portal! 🎊

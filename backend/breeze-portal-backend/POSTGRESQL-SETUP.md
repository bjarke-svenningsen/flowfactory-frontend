# PostgreSQL Setup Guide - Railway

Din backend bruger nu **smart database switching**:
- **Lokalt (development):** SQLite database
- **Production (Railway):** PostgreSQL database

Dette betyder at din database **overlever redeploys** og data ikke går tabt! 🎉

---

## 🚀 Step 1: Tilføj PostgreSQL til Railway

### 1.1 Gå til Railway Dashboard
1. Åbn [railway.app](https://railway.app)
2. Log ind
3. Find dit backend projekt (flowfactory-backend-production)

### 1.2 Tilføj PostgreSQL Database
1. Klik på dit projekt
2. Klik **"+ New"** knappen (øverst til højre)
3. Vælg **"Database"**
4. Vælg **"Add PostgreSQL"**

### 1.3 Vent på Database Provisioning
Railway opretter automatisk:
- PostgreSQL database
- `DATABASE_URL` environment variable
- Connection credentials

**Vent 1-2 minutter** mens Railway sætter databasen op.

---

## 🔧 Step 2: Setup Database Tabeller

### 2.1 Åbn Railway Shell
1. I Railway dashboard, klik på dit **backend service** (IKKE databasen)
2. Gå til **"Deployments"** tab
3. Klik på den seneste deployment
4. Find og klik **"View Logs"** eller **"Terminal"** (afhængigt af UI)
5. Du skulle nu have en terminal

### 2.2 Kør Setup Script
I Railway terminalen, kør:
```bash
node setup-postgres.js
```

**Output du skulle se:**
```
🚀 Setting up PostgreSQL database...

✅ Users table created
✅ Messages table created
✅ Posts table created
✅ Comments table created
✅ Files table created
✅ Customers table created
✅ Quotes table created
✅ Quote items table created
✅ Customer contacts table created
✅ Orders table created
✅ Order items table created
✅ Order documents table created

🎉 PostgreSQL database setup complete!
```

---

## 👤 Step 3: Opret Admin Bruger

### 3.1 Opdater .env (lokalt)
Først, få din DATABASE_URL fra Railway:

1. I Railway dashboard, klik på **PostgreSQL** servicen
2. Gå til **"Variables"** tab
3. Find `DATABASE_URL` og kopier værdien

### 3.2 Test Lokalt (Valgfrit)
Du kan teste PostgreSQL lokalt før deployment:

Opret `.env` fil i `backend/breeze-portal-backend/`:
```env
DATABASE_URL=postgresql://postgres:xxx@xxx.railway.app:5432/railway
```

Kør:
```bash
node create-admin.js
```

### 3.3 Opret Admin på Railway
I Railway terminal, kør:
```bash
node create-admin.js
```

**Følg instruktionerne:**
1. Indtast email: `bjarke.sv@gmail.com`
2. Indtast password: `Olineersej123`
3. Indtast navn: `Bjarke`

---

## 🎯 Step 4: Verificer Setup

### 4.1 Tjek Database Connection
Test at backend kan forbinde til PostgreSQL:

Åbn i browser:
```
https://flowfactory-backend-production.up.railway.app/
```

**Forventet output:**
```json
{
  "ok": true,
  "message": "Breeze API kører!"
}
```

### 4.2 Tjek Logs
I Railway:
1. Gå til **"Deployments"** → **"View Logs"**
2. Du skulle se:
```
📊 Database Mode: PostgreSQL (Production)
✅ PostgreSQL connection pool created
```

### 4.3 Test Login
Gå til din portal:
```
https://flowfactory-denmark.netlify.app
```

Log ind med:
- Email: `bjarke.sv@gmail.com`
- Password: `Olineersej123`

**Det skulle virke nu! 🎉**

---

## ✅ Fordele ved PostgreSQL

### Før (SQLite):
❌ Database resetter ved hver deploy  
❌ Data går tabt ved redeploy  
❌ Ingen persistent storage  

### Nu (PostgreSQL):
✅ Database overlever redeploys  
✅ Persistent data storage  
✅ Production-ready  
✅ Gratis på Railway  
✅ Automatisk backups  

---

## 🔄 Hvordan det virker

### Smart Database Switching
Din `database-config.js` tjekker automatisk:

```javascript
const isProduction = !!process.env.DATABASE_URL;
```

**Lokalt (uden DATABASE_URL):**
- Bruger SQLite (`breeze.db`)
- Perfekt til udvikling
- Hurtig og nem

**Production (med DATABASE_URL):**
- Bruger PostgreSQL
- Persistent storage
- Production-ready

### Zero Code Changes Needed!
Din eksisterende kode virker uden ændringer:

```javascript
// Dette virker både lokalt og i production
const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
```

Database-config håndterer automatisk forskellen mellem SQLite og PostgreSQL!

---

## 🐛 Troubleshooting

### Problem: "DATABASE_URL not found"
**Løsning:**
1. Tjek at PostgreSQL er tilføjet i Railway
2. Vent 1-2 minutter efter tilføjelse
3. Genstart backend service

### Problem: "Connection refused"
**Løsning:**
1. Tjek Railway logs for fejl
2. Verificer at PostgreSQL kører
3. Tjek DATABASE_URL variablen er sat korrekt

### Problem: "Table does not exist"
**Løsning:**
1. Kør `node setup-postgres.js` igen
2. Tjek Railway terminal output for fejl

---

## 📊 Database Migration (Hvis du har eksisterende data)

Hvis du har data i din lokale SQLite database, som du vil migrere:

### Option 1: Manuel Migration
1. Export data fra SQLite
2. Import til PostgreSQL

### Option 2: Automatisk Migration Script
Jeg kan lave et script til dig hvis du har data der skal migreres!

---

## 🎉 Færdig!

Din portal bruger nu PostgreSQL i production!

**Benefits:**
✅ Data overlever redeploys  
✅ Login virker permanent  
✅ Filer, beskeder, alt persisterer  
✅ Production-ready setup  

**Test din portal nu:**
https://flowfactory-denmark.netlify.app

**Held og lykke! 🚀**

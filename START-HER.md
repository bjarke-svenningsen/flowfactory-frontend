# 🚀 SÅDAN STARTER DU PORTALEN

## Alt du skal gøre:

### 1. Dobbeltklik på `START-PORTAL.bat`

Det er det! Filen vil:
- ✅ Starte backend med SQLite database (lokal) på port 4000
- ✅ Starte frontend på port 8000
- ✅ Åbne to vinduer (et til backend, et til frontend)

### 2. Gå til portalen

Åbn din browser og gå til: **http://localhost:8000**

**VIGTIGT:** Du skal vente på at begge servere er startet før du forsøger at logge ind!
- Backend vindue skal vise: "🚀 Breeze backend kører på http://localhost:4000"
- Frontend vindue skal vise: "Serving HTTP on :: port 8000"

### 3. Log ind

```
Email:    bjarke.sv@gmail.com
Password: Olineersej123
```

**NU ER API'EN SAT TIL LOCALHOST** - Så frontend forbinder til din lokale backend!

## Sådan stopper du portalen

Luk de to cmd-vinduer der åbnede sig.

---

## Hvis noget går galt

### Problem: "Failed to fetch" eller "Cannot connect to backend"

**Løsning:**
1. Luk alle cmd-vinduer
2. Åbn PowerShell som administrator
3. Kør: `taskkill /F /IM node.exe`
4. Dobbeltklik på `START-PORTAL.bat` igen

### Problem: Backend crasher med PostgreSQL fejl

**Løsning:**
Du har stadig DATABASE_URL i din PowerShell session. Luk PowerShell og åbn en ny, eller kør:
```powershell
$env:DATABASE_URL = $null
```

---

## Din data er sikker! 🔒

- **Lokal SQLite database:** `backend/breeze-portal-backend/breeze.db`
  - Indeholder: 1 bruger, 4 posts, 2 filer, 5 ordrer, 2 kunder
  
- **PostgreSQL på Railway:** Data er også gemt her (backup)
  - Connection string findes i: `backend/breeze-portal-backend/.env.backup`

---

## Hvad er hvad?

- **START-PORTAL.bat** → Start alt (brug denne!)
- **START-BACKEND-SQLITE.bat** → Start kun backend (for debugging)
- **.env** → Konfiguration (skal være tom eller kun have kommentar)
- **.env.backup** → PostgreSQL connection (RØR IKKE!)

---

## Nu kan du arbejde videre! ✨

Når portalen kører, kan du arbejde med filhåndtering:
1. Undermapper i mapper (Windows Explorer stil)
2. Højreklik menu på mapper og filer
3. "Overfør til ordre" funktion

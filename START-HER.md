# 🚀 Breeze Portalen — START HER

## Sådan fungerer det nu (ÉN samlet løsning)

Hele portalen (frontend + backend + database) kører som **én tjeneste på Render**:

- **URL:** https://flowfactory-frontend-20zs.onrender.com
- **Database:** SQLite — ligger på Render-disken (`/data/breeze.db`) og overlever deploys
- **Deploy:** Sker automatisk når der pushes til GitHub — du skal intet gøre

## Log ind

```
Email:    bjarke.sv@gmail.com
Password: (som du normalt bruger)
```

## Sådan opdaterer du portalen (fremover)

1. Lav dine ændringer (fx med hjælp fra Cline)
2. Push til GitHub: `git add -A; git commit -m "beskrivelse"; git push`
3. Færdig — Render deployer automatisk på 2-5 minutter

**Du skal ALDRIG rette API-URL'er igen.** Frontend kalder sit eget domæne (relativ sti i `js/api.js`).

## Kør lokalt (til udvikling)

1. Åbn et terminalvindue i mappen `backend/breeze-portal-backend`
2. Kør: `npm install` (første gang) og derefter `node server.js`
3. Åbn http://localhost:4000 — portalen kører lokalt med lokal database

## Filstruktur (det vigtigste)

- `backend/breeze-portal-backend/server.js` — hele backenden (serverer OGSÅ frontend)
- `backend/breeze-portal-backend/database-config.js` — database-opsætning (SQLite)
- `js/api.js` — API-hjælper (brug relativ sti, rør ikke ved den)
- `pages/` + `js/` — frontend-sider

## Render-opsætning (reference)

- **Web Service**, Node, Root Directory: `backend/breeze-portal-backend`
- Build: `npm install` · Start: `node server.js`
- **Environment variables:** `DATA_DIR=/data`, `JWT_SECRET=<hemmelig nøgle>`
- **Persistent Disk:** mount på `/data`, 1 GB


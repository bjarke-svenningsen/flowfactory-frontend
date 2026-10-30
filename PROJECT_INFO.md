# Breeze Virksomhedsportal - DEPLOYMENT INFO

## AKTUEL OPSÆTNING (ÉN tjeneste)

- **Alt kører på Render som én Web Service:** https://flowfactory-portal.onrender.com
  - Serveren (`backend/breeze-portal-backend/server.js`) serverer BÅDE frontend og API
  - Database: SQLite på Render persistent disk (`/data/breeze.db`) — ingen ekstern database
  - Frontend kalder sin egen URL (relativ sti i `js/api.js`) — der er ingen URL-konfiguration
- **Deploy:** automatisk ved push til `main` på GitHub
- **GitHub Repo:** https://github.com/bjarke-svenningsen/flowfactory-frontend.git

## HVAD VI IKKE BRUGER LÆNGERE
- ❌ Supabase PostgreSQL — droppet. Slet projektet i Supabase.
- ❌ GitHub Pages — droppet. Frontend serveres af backend.
- ❌ Netlify / Railway — aldrig brugt / forladt.
- ❌ URL-fix-scripts — slettet. Der findes kun ÉN URL: tjenestens egen.

## Render-indstillinger (reference)
- Web Service, Node, Root Directory: `backend/breeze-portal-backend`
- Build: `npm install` · Start: `node server.js` · Instance: Starter
- Env vars: `DATA_DIR=/data`, `JWT_SECRET=<hemmelig>`
- Persistent Disk: mount `/data`, 1 GB

Se `START-HER.md` for daglig brug.

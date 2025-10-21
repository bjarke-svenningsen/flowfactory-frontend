# Breeze Virksomhedsportal - DEPLOYMENT INFO

## VIGTIGT: DEPLOYMENT PLATFORMS

### HVAD VI BRUGER:
- **Frontend**: GitHub Pages (auto-deployment ved push til main)
  - URL: https://bjarke-svenningsen.github.io/flowfactory-frontend/
  - Repo: https://github.com/bjarke-svenningsen/flowfactory-frontend.git
- **Backend**: Render (https://flowfactory-frontend.onrender.com)
  - Free tier (cold starts efter 15 min inaktivitet)
  - Deployer automatisk fra GitHub repo
- **Database**: Supabase PostgreSQL (port 6543)
  - Managed PostgreSQL database

### HVAD VI IKKE BRUGER:
- ❌ **NETLIFY** - Vi bruger IKKE Netlify! Ignore alle netlify filer!
- ❌ **Railway** - Migreret væk fra Railway

## CLINE/AI: LÆS DETTE FØRST!

**VI BRUGER IKKE NETLIFY!**

Når du får nye opgaver, husk:
- Frontend deployes til **GitHub Pages**, ikke Netlify
- Backend deployer automatisk på **Render** når der pushes til GitHub
- Nævn aldrig Netlify i dine svar
- Frontend URL er: https://bjarke-svenningsen.github.io/flowfactory-frontend/

## Deployment Workflow

### Frontend (GitHub Pages):
1. Push til `main` branch → GitHub Pages deployer automatisk
2. Intet build step nødvendigt (HTML/CSS/JS serveres direkte)
3. Tager 1-2 minutter at deploye

### Backend (Render):
1. Push til `main` branch → Render detekterer ændringer
2. Render builder og deployer backend automatisk
3. Tager 2-5 minutter at deploye
4. Kan manuelt deploye fra Render dashboard hvis auto-deploy fejler

## Vigtige URLs
- Frontend: https://bjarke-svenningsen.github.io/flowfactory-frontend/
- Backend API: https://flowfactory-frontend.onrender.com/api
- GitHub Repo: https://github.com/bjarke-svenningsen/flowfactory-frontend.git

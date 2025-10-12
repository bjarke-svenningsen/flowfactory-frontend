# 📂 Modulær Virksomhedsportal Struktur

## 🎯 Formål
Dashboard.html er nu opdelt i mindre, modulære dele for at reducere token-forbrug og gøre udviklingen lettere.

## 📊 Sammenligning

### Før:
- **dashboard.html**: ~2000 linjer HTML + ~1000 linjer inline JavaScript
- **Token forbrug**: ~100.000-120.000 tokens når åbnet
- **Problem**: Svært at arbejde med, langsom, dyrt

### Efter:
- **dashboard.html**: ~80 linjer (kun shell/container)
- **Token forbrug**: ~10.000-20.000 tokens
- **Fordel**: 80-90% reduktion i token-forbrug! ✅

## 🏗️ Ny Struktur

```
Virksomhedsportal/
├── pages/                      # HTML templates for hver side
│   ├── feed.html              # Feed side (kun HTML)
│   ├── profile.html           # Profil side
│   ├── files.html             # Filer side
│   ├── chat.html              # Chat side
│   ├── videocall.html         # Videoopkald side
│   ├── colleagues.html        # Kolleger side
│   ├── quotes.html            # Ordrestyring side
│   ├── admin.html             # Admin panel
│   └── settings.html          # Indstillinger side
│
├── js/                        # JavaScript moduler
│   ├── page-loader.js         # Dynamisk side-loading system
│   ├── dashboard.js           # Hovedfunktioner (showPage, logout, osv.)
│   ├── profile.js             # Profil-funktioner
│   ├── admin.js               # Admin-funktioner
│   ├── settings.js            # Indstillinger-funktioner
│   ├── feed.js                # Feed-funktioner (eksisterende)
│   ├── chat.js                # Chat-funktioner (eksisterende)
│   ├── files-real.js          # Fil-funktioner (eksisterende)
│   ├── colleagues.js          # Kollega-funktioner (eksisterende)
│   ├── videocall.js           # Videoopkald-funktioner (eksisterende)
│   ├── theme.js               # Tema-funktioner (eksisterende)
│   └── quotes/                # Ordrestyring moduler (eksisterende)
│       ├── quotes-core.js
│       ├── quotes-customers.js
│       ├── quotes-invoices.js
│       ├── quotes-utils.js
│       └── quotes-workspace.js
│
└── dashboard.html             # Minimal shell (kun ~80 linjer)
```

## 🔧 Sådan Virker Det

### 1. Page Loader System (`js/page-loader.js`)
```javascript
// Loader HTML fra pages/ mappen dynamisk
await window.pageLoader.loadPage('feed');

// Registrer page-specific initialization
window.pageLoader.registerPageInit('profile', function() {
    // Kode der kører når profil-siden loader
});
```

### 2. Dashboard Shell (`dashboard.html`)
- Kun navigation og page container
- Ingen inline scripts
- Alle sider loades dynamisk via fetch()

### 3. Page Templates (`pages/*.html`)
- Kun HTML for den specifikke side
- Ingen <html>, <head>, eller <body> tags
- Kan have inline onclick handlers (men funktionerne er i separate JS filer)

### 4. JavaScript Moduler (`js/*.js`)
- Hver side har sin egen JS fil hvis nødvendigt
- Funktioner er globale så de kan kaldes fra HTML
- Page initializers registreres med page-loader

## 📝 Eksempel: Tilføj Ny Side

### 1. Opret HTML template:
```html
<!-- pages/mysideside.html -->
<h2>Min Nye Side</h2>
<p>Indhold her...</p>
<button onclick="minFunktion()">Klik her</button>
```

### 2. Opret JavaScript fil (valgfri):
```javascript
// js/mypage.js
function minFunktion() {
    alert('Hej!');
}

// Registrer page initializer
window.pageLoader.registerPageInit('mypage', function() {
    console.log('Min side er loadet!');
});
```

### 3. Tilføj menu item i dashboard.html:
```html
<div class="menu-item" onclick="showPage('mypage')">🎉 Min Side</div>
```

### 4. Inkluder JS fil i dashboard.html:
```html
<script src="js/mypage.js"></script>
```

## ✅ Fordele

1. **Token Besparelse**: 80-90% mindre token-forbrug
2. **Hurtigere Udvikling**: Kun se den relevante kode
3. **Lettere Vedligeholdelse**: Find bugs nemmere
4. **Bedre Performance**: Kun load hvad der skal bruges
5. **Modulær Arkitektur**: Nem at udvide/ændre

## 🔄 Migration Completed

- ✅ Alle 9 sider ekstraheret til `pages/`
- ✅ Alle inline scripts flyttet til separate JS filer
- ✅ Page loader system implementeret
- ✅ Dashboard.html reduceret til minimal shell
- ✅ Backup gemt som `dashboard-old-backup.html`

## 🚀 Test

Start portalen som normalt:
1. Start backend: `cd backend/breeze-portal-backend && node server.js`
2. Åbn dashboard i browser
3. Test at alle sider loader korrekt
4. Tjek konsollen for fejl

## 📦 Backup

Den originale `dashboard.html` er gemt som:
- `dashboard-old-backup.html` - Fuld backup af original fil

Hvis noget går galt, kan du nemt gå tilbage:
```bash
copy dashboard-old-backup.html dashboard.html
```

## 🎉 Resultat

Vi har nu en professionel, modulær arkitektur der:
- Er lettere at arbejde med
- Bruger 80-90% færre tokens
- Følger best practices for web development
- Er klar til fremtidig skalering

**Token-forbrug når man åbner dashboard.html:**
- **Før**: ~100.000 tokens 😱
- **Efter**: ~10.000 tokens 🎉
- **Besparelse**: ~90.000 tokens per session!

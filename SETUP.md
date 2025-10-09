# 🚀 FlowFactory Portal - Nybegynder Setup Guide

Velkommen! Denne guide hjælper dig med at få portalen kørende - selv hvis du aldrig har kodet før.

## 📋 Hvad Du Skal Bruge

1. **En computer** (Windows, Mac eller Linux)
2. **Internetforbindelse**
3. **30 minutter** af din tid

## 🔧 Installation - Trin for Trin

### Trin 1: Install Node.js

Node.js er det program der kører backend serveren.

1. Gå til https://nodejs.org
2. Download **LTS versionen** (den venstre knap)
3. Kør installeren og følg vejledningen
4. Genstart din computer efter installation

**Test at det virker:**
- Åbn Terminal (Mac) eller Command Prompt (Windows)
- Skriv: `node --version`
- Du skal se et versionsnummer (f.eks. v20.11.0)

### Trin 2: Download Projektet

1. Download hele projektet som en ZIP fil
2. Pak ZIP filen ud på dit skrivebord
3. Du har nu en mappe der hedder "Virksomhedsportal"

### Trin 3: Åbn Terminal/Command Prompt

**På Windows:**
1. Tryk Windows-tasten
2. Skriv "cmd" og tryk Enter

**På Mac:**
1. Tryk Cmd+Space
2. Skriv "terminal" og tryk Enter

### Trin 4: Naviger til Projekt Mappen

I din terminal/command prompt:

**På Windows:**
```
cd Desktop\Virksomhedsportal\backend\breeze-portal-backend
```

**På Mac:**
```
cd ~/Desktop/Virksomhedsportal/backend/breeze-portal-backend
```

### Trin 5: Installer Backend Afhængigheder

Skriv denne kommando og tryk Enter:

```
npm install
```

**Vent!** Det tager 1-2 minutter. Du ser en masse tekst rulle forbi - det er normalt!

### Trin 6: Opret Din Første Admin Bruger

Nu skal du oprette en admin bruger. Skriv:

```
node create-admin.js
```

Programmet vil bede om:
- **Fulde navn:** Dit navn (f.eks. "Peter Hansen")
- **Email:** Din email (f.eks. "peter@firma.dk")
- **Adgangskode:** Vælg en sikker adgangskode (mindst 6 tegn)
- **Bekræft adgangskode:** Skriv samme adgangskode igen

✅ **Succes!** Nu har du en admin bruger!

### Trin 7: Start Backend Serveren

Skriv:

```
npm run dev
```

Du skulle gerne se:
```
🚀 Breeze backend kører på http://localhost:4000
```

**VIGTIG:** Luk IKKE dette vindue! Serveren skal køre i baggrunden.

### Trin 8: Start Frontend

Åbn et NYT terminal/command prompt vindue (så det første stadig kører).

**På Windows:**
```
cd Desktop\Virksomhedsportal
python -m http.server 8000
```

**På Mac:**
```
cd ~/Desktop/Virksomhedsportal
python3 -m http.server 8000
```

Du skulle gerne se:
```
Serving HTTP on :: port 8000 ...
```

## 🎉 Færdig! Åbn Portalen

1. Åbn din browser (Chrome, Firefox, Safari)
2. Gå til: **http://localhost:8000**
3. Log ind med den email og adgangskode du oprettede i Trin 6

## 🛡️ Admin Panel - Sådan Fungerer Det

Som admin kan du:

### 1. Generer Invite Koder
- Gå til 🛡️ Admin Panel
- Klik "➕ Generer Ny Kode"
- Del koden med nye medarbejdere

### 2. Godkend Nye Brugere
- Når nogen registrerer uden invite kode
- Går de i "Ventende" liste
- Du kan godkende eller afvise dem

### 3. Gør Andre til Admin
- Se alle brugere i Admin Panel
- Klik "Gør til admin" på en bruger
- De får admin rettigheder

## 📖 Hverdagsbrug

### For Normal Bruger:

**Registrering MED invite kode:**
1. Gå til login siden
2. Klik "Ny bruger? Registrer her"
3. Udfyld formularen
4. Indtast invite koden
5. ✅ Du får direkte adgang!

**Registrering UDEN invite kode:**
1. Gå til login siden
2. Klik "Ny bruger? Registrer her"
3. Udfyld formularen (lad invite kode feltet være tomt)
4. ⏳ Vent på admin godkendelse
5. ✅ Du får adgang når admin har godkendt dig

### For Admin:

**Tjek ventende brugere:**
1. Log ind
2. Gå til 🛡️ Admin Panel
3. Se "Ventende Registreringer"
4. Klik ✅ Godkend eller ❌ Afvis

## ❓ Problemløsning

### "command not found: node"
- Node.js er ikke installeret korrekt
- Geninstaller Node.js og genstart computeren

### "Port 4000 is already in use"
- Serveren kører allerede
- Find det vindue og luk det, eller
- Brug en anden port i .env filen

### "Cannot GET /"
- Frontend serveren kører ikke
- Start `python -m http.server 8000` igen

### "Network Error" i browseren
- Backend serveren kører ikke
- Check at `npm run dev` kører
- Prøv at genstarte backend serveren

### Kan ikke logge ind
- Er du sikker på email og adgangskode er korrekte?
- Prøv at oprette en ny admin med `node create-admin.js`

## 🔄 Genstart Portalen

Næste gang du skal bruge portalen:

1. Åbn terminal/command prompt
2. Naviger til backend mappen
3. Kør: `npm run dev`
4. Åbn NYT terminal vindue
5. Naviger til projekt mappen
6. Kør: `python -m http.server 8000` (Windows) eller `python3 -m http.server 8000` (Mac)
7. Gå til http://localhost:8000 i browseren

## 📞 Hjælp & Support

Hvis du har problemer:

1. Læs fejlmeddel

elsen nøje
2. Google fejlen (ofte findes svaret hurtigt)
3. Check at begge servere kører (backend OG frontend)
4. Prøv at genstarte alt

## 🎓 Næste Skridt

Nu hvor portalen kører lokalt, kan du:

1. **Læse DEPLOYMENT.md** for at sætte den op online
2. **Invitere kolleger** ved at generere invite koder
3. **Tilpasse portalen** efter jeres behov
4. **Tage backup** af databasen regelmæssigt

---

**🎉 Tillykke! Du har nu en fungerende virksomhedsportal!**

Hvis alt virker, kan du nu:
- 📰 Dele opslag i feedet
- 💬 Chatte med kolleger
- 📁 Dele filer
- 📞 Starte videoopkald
- 👥 Se kolleger
- 🛡️ Administrere brugere (som admin)

God fornøjelse! 🚀

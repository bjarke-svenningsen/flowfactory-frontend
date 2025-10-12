# 🚀 FlowFactory Portal - Deployment Guide

## Produktion Setup

### 1. Server Krav
- Node.js 18+ 
- Mindst 512MB RAM
- 1GB disk space
- Offentlig IP eller domæne

### 2. Installation

```bash
# Clone projektet
git clone <repository-url>
cd backend/breeze-portal-backend

# Install dependencies
npm install

# Konfigurer miljø variabler
cp .env.example .env
nano .env
```

### 3. Miljø Konfiguration (.env)

```env
# VIGTIGT: Skift disse værdier i produktion!
PORT=4000
JWT_SECRET=din-meget-sikre-random-string-her-minimum-32-tegn
NODE_ENV=production

# Valgfrit: Database sti
DATABASE_PATH=./breeze.db
```

**Generér en sikker JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Opret Første Admin Bruger

```bash
node create-admin.js
```

Følg prompten for at oprette admin kontoen.

### 5. Start Serveren

**Development:**
```bash
npm run dev
```

**Production (med PM2):**
```bash
# Install PM2 globalt
npm install -g pm2

# Start serveren
pm2 start server.js --name flowfactory-portal

# Konfigurer auto-restart
pm2 startup
pm2 save

# Se logs
pm2 logs flowfactory-portal

# Genstart
pm2 restart flowfactory-portal
```

## Sikkerhed Features

### 🔐 Registrerings Sikkerhed

Systemet har 2 måder at registrere brugere på:

#### 1. **Invite Koder** (Anbefalet)
- Admin genererer unique invite koder
- Koder har udløbsdato
- Kan kun bruges én gang
- Giver direkte adgang

#### 2. **Manual Godkendelse**
- Nye brugere opretter konto uden invite
- Går i "pending" status
- Admin skal manuelt godkende/afvise
- Email notifikation ved godkendelse (TODO)

### 👮 Admin Panel Funktioner

Admins kan:
- ✅ Godkende/afvise ventende brugere
- 🎫 Generer invite koder
- 👥 Se alle brugere
- 🛡️ Tildele/fjerne admin rettigheder
- 🗑️ Slette ubrugte invite koder

## Netværk & Firewall

### Åbn Porte
```bash
# UFW (Ubuntu)
sudo ufw allow 4000/tcp
sudo ufw enable

# Firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=4000/tcp
sudo firewall-cmd --reload
```

### Nginx Reverse Proxy (Anbefalet)

```nginx
# /etc/nginx/sites-available/flowfactory
server {
    listen 80;
    server_name portal.flowfactory.dk;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    # WebSocket support for Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Aktivér site:
```bash
sudo ln -s /etc/nginx/sites-available/flowfactory /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL Certifikat (Let's Encrypt)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Få SSL certifikat
sudo certbot --nginx -d portal.flowfactory.dk

# Auto-renewal er configureret automatisk
```

## Database Backup

### Automatisk Backup Script

```bash
#!/bin/bash
# backup-db.sh

BACKUP_DIR="/backups/flowfactory"
DB_PATH="/path/to/breeze.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp $DB_PATH $BACKUP_DIR/breeze_$DATE.db

# Hold kun sidste 30 dage
find $BACKUP_DIR -name "breeze_*.db" -mtime +30 -delete
```

Tilføj til crontab:
```bash
# Backup hver dag kl 02:00
0 2 * * * /path/to/backup-db.sh
```

## Monitoring

### Health Check Endpoint

API'et svarer på:
```
GET http://your-server:4000/
```

Brug til monitoring services (UptimeRobot, Pingdom, etc.)

### PM2 Monitoring

```bash
# Se status
pm2 status

# Se ressource forbrug
pm2 monit

# Se detaljerede logs
pm2 logs flowfactory-portal --lines 100
```

## Frontend Deployment

Frontend kan deployes til:
- **Netlify** (gratis tier)
- **Vercel** (gratis tier)
- **GitHub Pages**
- **Nginx static hosting**

Opdater API endpoint i frontend til din server:
```javascript
// js/api.js eller hvor API_BASE_URL er defineret
const API_BASE_URL = 'https://portal.flowfactory.dk';
```

## Opdateringer

```bash
# Pull nye ændringer
git pull

# Install nye dependencies
npm install

# Genstart server
pm2 restart flowfactory-portal

# Eller hvis du ikke bruger PM2
# Tryk Ctrl+C og kør: npm start
```

## Troubleshooting

### Port allerede i brug
```bash
# Find process
sudo lsof -i :4000

# Kill process
kill -9 <PID>
```

### Database locked
```bash
# Check for zombie processes
ps aux | grep node

# Restart server
pm2 restart flowfactory-portal
```

### Kan ikke oprette forbindelse
1. Check firewall er åben
2. Verificer PORT i .env matcher server
3. Check nginx config hvis brugt
4. Se server logs: `pm2 logs`

## Sikkerhed Checkliste

- [ ] JWT_SECRET ændret fra default
- [ ] Firewall konfigureret 
- [ ] SSL certifikat installeret
- [ ] Backup system kørende
- [ ] PM2 auto-restart aktiveret
- [ ] Admin bruger oprettet
- [ ] Database ikke offentligt tilgængelig
- [ ] Logs roteres (PM2 gør dette automatisk)
- [ ] CORS konfigureret til kun dit domæne (opdater i server.js)

## Support

Ved problemer:
- Email: support@flowfactory.dk
- Check logs: `pm2 logs flowfactory-portal`
- Server status: `pm2 status`

// switch-to-production.js
// Switch all API URLs back to Railway for production
const fs = require('fs');
const path = require('path');

const localhostUrl = 'http://localhost:4000';
const railwayUrl = 'https://flowfactory-backend-production.up.railway.app';

let totalReplacements = 0;
let filesFixed = 0;

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (file.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            const matches = (content.match(new RegExp(localhostUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
            
            if (matches > 0) {
                content = content.replace(new RegExp(localhostUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), railwayUrl);
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`✓ ${file}: ${matches} replacements`);
                totalReplacements += matches;
                filesFixed++;
            }
        }
    });
}

console.log('========================================');
console.log('  SWITCH TIL PRODUCTION (RAILWAY)');
console.log('========================================');
console.log('');

processDirectory('./js');

console.log('');
console.log('========================================');
console.log('  DONE!');
console.log('========================================');
console.log('');
console.log(`✓ ${filesFixed} files fixed`);
console.log(`✓ ${totalReplacements} total replacements`);
console.log('');
console.log('All API URLs now point to: ' + railwayUrl);
console.log('');
console.log('Next steps:');
console.log('  1. Commit changes: git add . && git commit -m "Switch to production"');
console.log('  2. Push to GitHub: git push');
console.log('  3. Netlify will auto-deploy');
console.log('  4. Visit: https://flowfactory-denmark.netlify.app');
console.log('');

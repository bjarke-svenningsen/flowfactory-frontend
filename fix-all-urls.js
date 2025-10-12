// fix-all-urls.js
// Replace all Railway URLs with localhost in JS files
const fs = require('fs');
const path = require('path');

const railwayUrl = 'https://flowfactory-backend-production.up.railway.app';
const localhostUrl = 'http://localhost:4000';

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
            const matches = (content.match(new RegExp(railwayUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
            
            if (matches > 0) {
                content = content.replace(new RegExp(railwayUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), localhostUrl);
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`✓ ${file}: ${matches} replacements`);
                totalReplacements += matches;
                filesFixed++;
            }
        }
    });
}

console.log('========================================');
console.log('  FIX ALL API URLS TO LOCALHOST');
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
console.log('All API URLs now point to: ' + localhostUrl);
console.log('');

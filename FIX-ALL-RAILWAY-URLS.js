// FIX-ALL-RAILWAY-URLS.js - Replace ALL hardcoded Railway URLs with Render URL
import fs from 'fs';
import path from 'path';

const OLD_URL = 'https://flowfactory-backend-production.up.railway.app';
const NEW_URL = 'https://flowfactory-frontend.onrender.com';

const filesToFix = [
  'js/admin.js',
  'js/chat.js',
  'js/colleagues.js',
  'js/feed.js',
  'js/files-real.js',
  'js/login.js',
  'js/profile.js',
  'js/quotes.js',
  'js/videocall.js',
  'js/quotes/quotes-core.js',
  'js/quotes/quotes-customers.js',
  'js/quotes/quotes-invoices.js',
  'js/quotes/quotes-workspace.js'
];

console.log('🔧 Fixing all hardcoded Railway URLs...\n');

let totalReplacements = 0;

for (const file of filesToFix) {
  try {
    const filePath = path.join(process.cwd(), file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const count = (content.match(new RegExp(OLD_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    
    if (count > 0) {
      const newContent = content.replaceAll(OLD_URL, NEW_URL);
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ ${file}: Replaced ${count} occurrences`);
      totalReplacements += count;
    } else {
      console.log(`⚪ ${file}: Already updated`);
    }
  } catch (error) {
    console.log(`❌ ${file}: Error - ${error.message}`);
  }
}

console.log(`\n🎉 Total replacements: ${totalReplacements}`);
console.log('\n📋 Next steps:');
console.log('1. git add -A');
console.log('2. git commit -m "Fix all hardcoded Railway URLs to Render"');
console.log('3. git push origin main');
console.log('4. Wait 2 minutes for Netlify deployment');
console.log('5. Hard refresh browser and test!\n');

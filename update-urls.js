// update-urls.js - Automatisk URL Replacement Script
const fs = require('fs');
const path = require('path');

// Dine deployment URLs
const BACKEND_URL = 'https://flowfactory-backend-production.up.railway.app';
const FRONTEND_URL = 'https://flowfactory-denmark.netlify.app';

// URLs der skal erstattes
const replacements = [
  { from: 'http://localhost:4000', to: BACKEND_URL },
  { from: 'http://localhost:3000', to: FRONTEND_URL },
  { from: 'localhost:4000', to: 'flowfactory-backend-production.up.railway.app' },
  { from: 'localhost:3000', to: 'flowfactory-denmark.netlify.app' },
];

// Filer og mapper der skal scannes
const scanPaths = [
  'js',
  'pages',
  'backend/breeze-portal-backend',
  'index.html',
  'dashboard.html',
];

// Filtyper der skal scannes
const fileExtensions = ['.js', '.html', '.json', '.md'];

// Filer der skal ignoreres
const ignoreFiles = ['node_modules', 'uploads', '.git', 'update-urls.js'];

let totalChanges = 0;
const changedFiles = [];

function shouldIgnore(filePath) {
  return ignoreFiles.some(ignore => filePath.includes(ignore));
}

function replaceInFile(filePath) {
  if (shouldIgnore(filePath)) return;
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let fileChanges = 0;

    replacements.forEach(({ from, to }) => {
      const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = content.match(regex);
      
      if (matches) {
        content = content.replace(regex, to);
        modified = true;
        fileChanges += matches.length;
        totalChanges += matches.length;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      changedFiles.push({ file: filePath, changes: fileChanges });
      console.log(`✅ Opdateret: ${filePath} (${fileChanges} ændringer)`);
    }
  } catch (error) {
    console.error(`❌ Fejl i ${filePath}:`, error.message);
  }
}

function scanDirectory(dirPath) {
  if (shouldIgnore(dirPath)) return;

  try {
    const items = fs.readdirSync(dirPath);

    items.forEach(item => {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(fullPath);
        if (fileExtensions.includes(ext)) {
          replaceInFile(fullPath);
        }
      }
    });
  } catch (error) {
    console.error(`❌ Fejl ved scanning af ${dirPath}:`, error.message);
  }
}

console.log('🚀 Starter URL replacement...\n');
console.log('📍 Backend URL:', BACKEND_URL);
console.log('📍 Frontend URL:', FRONTEND_URL);
console.log('─────────────────────────────────────\n');

// Scan alle stier
scanPaths.forEach(scanPath => {
  const fullPath = path.join(__dirname, scanPath);
  
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (stat.isFile()) {
      replaceInFile(fullPath);
    }
  }
});

console.log('\n─────────────────────────────────────');
console.log(`\n✨ Færdig! ${totalChanges} URLs opdateret i ${changedFiles.length} filer.\n`);

if (changedFiles.length > 0) {
  console.log('📝 Ændrede filer:');
  changedFiles.forEach(({ file, changes }) => {
    console.log(`   - ${file} (${changes} ændringer)`);
  });
}

console.log('\n🎯 Næste trin:');
console.log('1. Gennemgå ændringerne i filerne');
console.log('2. Commit og push til GitHub:');
console.log('   git add .');
console.log('   git commit -m "Update URLs for production deployment"');
console.log('   git push');
console.log('3. Netlify auto-deployer automatisk!');
console.log('4. Railway auto-deployer automatisk!');
console.log('\n🚀 Din portal skulle nu virke online!');

const fs = require('fs');
const path = require('path');

// Helper to get files recursively
function getFilesRecursively(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getFilesRecursively(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const rootDir = path.resolve(__dirname, '..');
const nextStaticDir = path.join(rootDir, '.next', 'static');
const publicDir = path.join(rootDir, 'public');

// Get all files
const nextFiles = getFilesRecursively(nextStaticDir)
  .filter(f => !f.endsWith('.map'))
  .map(f => {
    const rel = path.relative(rootDir, f).replace(/\\/g, '/');
    // Map .next/static/ to /_next/static/
    return rel.replace('.next/', '_next/');
  });

const publicFiles = getFilesRecursively(publicDir)
  .filter(f => {
    const base = path.basename(f);
    return !f.endsWith('.map') && 
           base !== 'manifest.json' && 
           base !== 'sw.js' &&
           !base.startsWith('icon-');
  })
  .map(f => {
    const rel = path.relative(publicDir, f).replace(/\\/g, '/');
    return '/' + rel;
  });

// Unique list of assets
const allAssets = Array.from(new Set([...nextFiles, ...publicFiles])).map(p => p.startsWith('/') ? p : '/' + p);

// Read build ID or generate one
let buildId = Date.now().toString();
const buildIdFile = path.join(rootDir, '.next', 'BUILD_ID');
if (fs.existsSync(buildIdFile)) {
  buildId = fs.readFileSync(buildIdFile, 'utf8').trim();
}

console.log(`Generating sw.js with build ID: ${buildId}`);
console.log(`Pre-caching ${allAssets.length} build-time assets.`);

// Compile sw.js
const templatePath = path.join(rootDir, 'scripts', 'sw-template.js');
let template = fs.readFileSync(templatePath, 'utf8');

template = template.replace('__BUILD_ID__', buildId);
const assetsString = allAssets.map(a => `  '${a}'`).join(',\n');
template = template.replace('// __PRECACHE_ASSETS__', assetsString);

const outputPath = path.join(publicDir, 'sw.js');
fs.writeFileSync(outputPath, template, 'utf8');
console.log(`Successfully generated public/sw.js!`);

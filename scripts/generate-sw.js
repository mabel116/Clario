const fs = require('fs');
const path = require('path');

/**
 * Recursively crawls a directory and returns an array of all absolute file paths.
 */
function crawlDirectory(dir) {
  let fileList = [];
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fileList = fileList.concat(crawlDirectory(fullPath));
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const rootDir = path.resolve(__dirname, '..');
const nextStaticDir = path.join(rootDir, '.next', 'static');
const publicDir = path.join(rootDir, 'public');

// Set of all static assets to precache
const staticAssetSet = new Set();

// 1. Recursively crawl .next/static for all build chunks, stylesheets, wasm, and media
const allNextStaticFiles = crawlDirectory(nextStaticDir);
for (const file of allNextStaticFiles) {
  // Exclude source maps
  if (file.endsWith('.map')) continue;

  const rel = path.relative(rootDir, file).replace(/\\/g, '/');
  // Map .next/static/... to /_next/static/...
  const webPath = '/' + rel.replace(/^\.next\//, '_next/');
  staticAssetSet.add(webPath);

  // For dynamic route chunks containing brackets (e.g. [id]),
  // include both the literal bracket path and the URL-encoded (%5B / %5D) variant
  // because Next.js scripts and RSC manifests request chunks with percent-encoding.
  if (webPath.includes('[') || webPath.includes(']')) {
    const encoded = webPath.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
    staticAssetSet.add(encoded);
  } else if (webPath.includes('%5B') || webPath.includes('%5D')) {
    const decoded = decodeURIComponent(webPath);
    staticAssetSet.add(decoded);
  }
}

// 2. Parse app-build-manifest.json to ensure every app router page chunk is captured
const appManifestFile = path.join(rootDir, '.next', 'app-build-manifest.json');
if (fs.existsSync(appManifestFile)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(appManifestFile, 'utf8'));
    if (manifest.pages) {
      for (const chunks of Object.values(manifest.pages)) {
        for (const chunk of chunks) {
          const webPath = '/_next/' + chunk.replace(/\\/g, '/');
          staticAssetSet.add(webPath);
          if (webPath.includes('[') || webPath.includes(']')) {
            staticAssetSet.add(webPath.replace(/\[/g, '%5B').replace(/\]/g, '%5D'));
          }
        }
      }
    }
  } catch (e) {
    console.warn('[generate-sw] Warning parsing app-build-manifest.json:', e.message);
  }
}

// 3. Parse build-manifest.json to ensure all runtime, polyfill, and shared chunks are included
const buildManifestFile = path.join(rootDir, '.next', 'build-manifest.json');
if (fs.existsSync(buildManifestFile)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(buildManifestFile, 'utf8'));
    const chunkLists = [
      manifest.polyfillFiles || [],
      manifest.lowPriorityFiles || [],
      manifest.rootMainFiles || [],
      ...Object.values(manifest.pages || {})
    ];
    for (const list of chunkLists) {
      for (const chunk of list) {
        const webPath = '/_next/' + chunk.replace(/\\/g, '/');
        staticAssetSet.add(webPath);
        if (webPath.includes('[') || webPath.includes(']')) {
          staticAssetSet.add(webPath.replace(/\[/g, '%5B').replace(/\]/g, '%5D'));
        }
      }
    }
  } catch (e) {
    console.warn('[generate-sw] Warning parsing build-manifest.json:', e.message);
  }
}

// 4. Recursively crawl public/ for @powersync worker/wasm and public assets
const allPublicFiles = crawlDirectory(publicDir);
for (const file of allPublicFiles) {
  const base = path.basename(file);
  // Exclude source maps and the generated service worker itself
  if (file.endsWith('.map') || base === 'sw.js') continue;

  const rel = path.relative(publicDir, file).replace(/\\/g, '/');
  const webPath = '/' + rel;
  staticAssetSet.add(webPath);
}

// Sorted unique list of assets for deterministic output
const allAssets = Array.from(staticAssetSet).sort();

// Read build ID or generate one
let buildId = Date.now().toString();
const buildIdFile = path.join(rootDir, '.next', 'BUILD_ID');
if (fs.existsSync(buildIdFile)) {
  buildId = fs.readFileSync(buildIdFile, 'utf8').trim();
}

console.log(`Generating sw.js with build ID: ${buildId}`);
console.log(`Pre-caching ${allAssets.length} build-time assets.`);

// Verify dynamic route shells exist in .next/server/app
const serverAppDir = path.join(rootDir, '.next', 'server', 'app');
const dynamicShells = [
  path.join(serverAppDir, 'clients', '_shell_', 'invoices', 'new.html'),
  path.join(serverAppDir, 'invoices', '_shell_.html'),
  path.join(serverAppDir, 'invoices', '_shell_', 'edit.html')
];
const missingShells = dynamicShells.filter(s => !fs.existsSync(s));
if (missingShells.length > 0) {
  console.warn(`[generate-sw] Warning: Expected route shells not found:`, missingShells);
} else {
  console.log(`[generate-sw] Verified all dynamic route shells exist in .next/server/app`);
}

// Compile sw.js
const templatePath = path.join(rootDir, 'scripts', 'sw-template.js');
let template = fs.readFileSync(templatePath, 'utf8');

template = template.replace('__BUILD_ID__', buildId);
const assetsString = allAssets.map(a => `  '${a}'`).join(',\n');
template = template.replace('// __PRECACHE_ASSETS__', assetsString);

const outputPath = path.join(publicDir, 'sw.js');
fs.writeFileSync(outputPath, template, 'utf8');
console.log(`Successfully generated public/sw.js!`);

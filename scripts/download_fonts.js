const fs = require('fs');
const path = require('path');

async function downloadAndEncode() {
  const regularUrl = 'https://cdn.jsdelivr.net/npm/@xz/fonts@1/serve/src/inter/Inter-Regular.woff';
  const boldUrl = 'https://cdn.jsdelivr.net/npm/@xz/fonts@1/serve/src/inter/Inter-Bold.woff';

  console.log('Downloading Inter-Regular.woff...');
  const regRes = await fetch(regularUrl);
  if (!regRes.ok) throw new Error(`Failed to download regular font: ${regRes.statusText}`);
  const regBuffer = Buffer.from(await regRes.arrayBuffer());
  const regBase64 = `data:font/woff;base64,${regBuffer.toString('base64')}`;

  console.log('Downloading Inter-Bold.woff...');
  const boldRes = await fetch(boldUrl);
  if (!boldRes.ok) throw new Error(`Failed to download bold font: ${boldRes.statusText}`);
  const boldBuffer = Buffer.from(await boldRes.arrayBuffer());
  const boldBase64 = `data:font/woff;base64,${boldBuffer.toString('base64')}`;

  const outputPath = path.join(__dirname, '../src/components/fonts.ts');
  const fileContent = `// Automatically generated base64 fonts for offline PDF generation
export const INTER_REGULAR_B64 = '${regBase64}';
export const INTER_BOLD_B64 = '${boldBase64}';
`;

  fs.writeFileSync(outputPath, fileContent, 'utf-8');
  console.log(`Successfully generated fonts file at ${outputPath}`);
  console.log(`Regular font size: ${regBuffer.length} bytes`);
  console.log(`Bold font size: ${boldBuffer.length} bytes`);
}

downloadAndEncode().catch(err => {
  console.error('Error generating fonts:', err);
  process.exit(1);
});

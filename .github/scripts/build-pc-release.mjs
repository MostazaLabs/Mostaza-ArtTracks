import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import JSZip from 'jszip';
import { buildLocalWebAppFiles } from '../../src/lib/localWebAppTemplate.ts';

const root = process.cwd();
const outDir = path.join(root, 'dist-pc', 'Mostaza-ArtTracks');

fs.rmSync(path.join(root, 'dist-pc'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const files = buildLocalWebAppFiles();
const zip = new JSZip();

for (const file of files) {
  const dest = path.join(outDir, file.name);
  fs.writeFileSync(dest, file.content);
  if (file.executable) {
    fs.chmodSync(dest, 0o755);
  }
  zip.file(
    file.name,
    file.content,
    file.executable ? { unixPermissions: '755' } : undefined
  );
}

// 1. Validate generated JS syntax
execSync(`node --check "${path.join(outDir, 'server.mjs')}"`, { stdio: 'inherit' });
execSync(`node --check "${path.join(outDir, 'launcher.mjs')}"`, { stdio: 'inherit' });

// 2. Live smoke test of the standalone PC server
const testPort = '3467';
const child = spawn(process.execPath, [path.join(outDir, 'server.mjs'), '--headless'], {
  cwd: outDir,
  env: { ...process.env, PORT: testPort, HOST: '127.0.0.1' },
  stdio: 'pipe',
});

let ready = false;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const netRes = await fetch(`http://127.0.0.1:${testPort}/api/network-info`);
    if (netRes.ok) {
      const info = await netRes.json();
      if (info.maxActiveUsers !== 6 || info.hostname !== 'MostazaArtTracks') {
        throw new Error(`Unexpected network-info payload: ${JSON.stringify(info)}`);
      }
      const htmlRes = await fetch(`http://127.0.0.1:${testPort}/`);
      const html = await htmlRes.text();
      if (!htmlRes.ok || !html.includes('Mostaza ArtTracks')) {
        throw new Error('Local index.html check failed');
      }
      ready = true;
      break;
    }
  } catch {
    // Wait until server listens
  }
}

try {
  await fetch(`http://127.0.0.1:${testPort}/api/shutdown`, { method: 'POST' });
} catch {
  // Ignore
}
child.kill();

if (!ready) {
  throw new Error('Smoke test failed: local PC server did not become ready');
}

// 3. Write clean PKZIP 2.0 (Windows Explorer compatible) and tar.gz (macOS / Linux with +x permissions)
const outZipPath = path.join(root, 'Mostaza-ArtTracks-PC.zip');
let builtWithSystemZip = false;
try {
  execSync(
    `python3 -c "import os, zipfile; z=zipfile.ZipFile('${outZipPath.replace(/'/g, "\\'")}', 'w', zipfile.ZIP_DEFLATED); [z.write(os.path.join('${outDir.replace(/'/g, "\\'")}', f), f) for f in sorted(os.listdir('${outDir.replace(/'/g, "\\'")}'))]; z.close()"`,
    { stdio: 'inherit' }
  );
  builtWithSystemZip = true;
} catch {
  // Fallback to JSZip below
}

if (!builtWithSystemZip) {
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(outZipPath, zipBuffer);
}

execSync(
  `tar -czf "${path.join(root, 'Mostaza-ArtTracks-Mac-Linux.tar.gz')}" -C "${path.join(root, 'dist-pc')}" Mostaza-ArtTracks`,
  { stdio: 'inherit' }
);

console.log('Paquetes PC generados y verificados: Mostaza-ArtTracks-PC.zip y Mostaza-ArtTracks-Mac-Linux.tar.gz');

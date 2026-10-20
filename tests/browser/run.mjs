/**
 * Startet alle Browser-Testreihen gegen den Produktions-Build.
 *
 *   npm run test:browser                 alle Reihen
 *   npm run test:browser -- audit export einzelne Reihen
 *
 * Optionale Werkzeuge (fehlen sie, wird die betroffene Reihe übersprungen):
 *   CHROMIUM   Pfad zu Chromium (Standard: /opt/pw-browsers/chromium)
 *   VERAPDF    veraPDF-Kommandozeile (PDF/UA-1-Prüfung)
 *   VNU_JAR    W3C Nu Html Checker (vnu.jar, braucht Java)
 *   python3 mit Pillow (Testbilder, Kameravideos) und pypdf, pdftotext/pdfinfo/pdffonts (poppler)
 */
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const work = join(here, '.work');
const require = createRequire(import.meta.url);

const has = (cmd, args = ['--version']) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const python = (code) => has('python3', ['-I', '-c', code]);

const env = {
  ...process.env,
  AXE_PATH: require.resolve('axe-core/axe.min.js'),
  CHROMIUM: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  SCRIPTS: here,
  DIST: join(root, 'dist'),
};
const tools = {
  chromium: existsSync(env.CHROMIUM),
  pillow: python('import PIL'),
  pypdf: python('import pypdf'),
  poppler: has('pdftotext', ['-v']),
  verapdf: !!env.VERAPDF && existsSync(env.VERAPDF),
  vnu: !!env.VNU_JAR && existsSync(env.VNU_JAR) && has('java', ['-version']),
};

const suites = {
  e2e: ['pillow'],
  reader: ['pillow'],
  scanner: ['pillow'],
  ocr: [],
  docs: [],
  voice: ['poppler'],
  export: ['poppler', 'pypdf', 'verapdf', 'vnu'],
  audit: [],
  fixes: [],
  contrast: [],
  obscured: [],
};
const file = (name) => (name === 'e2e' ? 'e2e.mjs' : `${name}-e2e.mjs`);

if (!tools.chromium) {
  console.error(`Chromium nicht gefunden (${env.CHROMIUM}). Setze CHROMIUM=/pfad/zu/chromium.`);
  process.exit(2);
}

// Testdaten im Arbeitsordner
mkdirSync(work, { recursive: true });
for (const name of readdirSync(join(root, 'tests', 'fixtures'))) {
  copyFileSync(join(root, 'tests', 'fixtures', name), join(work, name));
}
if (tools.pillow && !existsSync(join(work, 'page.jpg'))) {
  // Großes „Blatt“ mit Balken (3000 × 4000) – prüft das Verkleinern beim Speichern.
  execFileSync('python3', ['-I', '-c', `from PIL import Image, ImageDraw
im=Image.new('RGB',(3000,4000),'white'); d=ImageDraw.Draw(im)
for i in range(20): d.rectangle([300,400+i*150,2700,450+i*150],fill='black')
im.save('${join(work, 'page.jpg')}')`]);
}
if (tools.pillow && !existsSync(join(work, 'video', 'sequence.y4m'))) {
  mkdirSync(join(work, 'video'), { recursive: true });
  console.log('Erzeuge Kameravideos (einmalig) …');
  execFileSync('python3', ['-I', join(here, 'make_video.py'), join(work, 'video')]);
}

console.log('Build …');
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: root, stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; i < 50; i++) {
  try {
    await fetch('http://localhost:4173/');
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const selected = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(suites);
let failed = false;
const summary = [];
for (const name of selected) {
  const missing = (suites[name] ?? []).filter((tool) => !tools[tool]);
  if (!suites[name]) {
    summary.push(`${name}: unbekannt`);
    failed = true;
    continue;
  }
  if (missing.length > 0) {
    summary.push(`${name.padEnd(9)} ÜBERSPRUNGEN (fehlt: ${missing.join(', ')})`);
    continue;
  }
  const output = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, file(name))], { cwd: work, env });
    let text = '';
    child.stdout.on('data', (d) => (text += d));
    child.stderr.on('data', (d) => (text += d));
    child.on('close', (code) => resolve({ text, code }));
  });
  const ok = (output.text.match(/^OK /gm) ?? []).length;
  const fail = (output.text.match(/^FAIL/gm) ?? []).length;
  const crashed = output.code !== 0 && fail === 0;
  if (fail > 0 || crashed) {
    failed = true;
    console.log(output.text.split('\n').filter((line) => /^FAIL|Error/.test(line)).join('\n'));
  }
  summary.push(`${name.padEnd(9)} ${ok} OK, ${fail} FAIL${crashed ? ', ABBRUCH' : ''}`);
}
stop();
console.log(`\n${summary.join('\n')}`);
process.exit(failed ? 1 : 0);

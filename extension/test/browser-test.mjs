// Loads the unpacked extension in headless Chromium against test/page.html and prints each
// block's data-slopmark state. Needs the live backend and its key.
// Usage: KEY=$SLOPMARK_KEY node extension/test/browser-test.mjs
//   PLAYWRIGHT=<path to playwright/index.mjs>  CHROME=<chromium binary>  (defaults below are Sleeper's)
const { chromium } = await import(process.env.PLAYWRIGHT || '/home/petter/github/Every15/node_modules/playwright/index.mjs');
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import http from 'node:http'; import fs from 'node:fs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '..');
const SP = fs.mkdtempSync(path.join(os.tmpdir(), 'slopmark-'));
const html = fs.readFileSync(path.join(HERE, 'page.html'));
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8765);
const ctx = await chromium.launchPersistentContext(`${SP}/profile`, {
  headless: true, executablePath: process.env.CHROME || '/usr/bin/chromium-browser',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new'],
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
await sw.evaluate((key) => chrome.storage.local.set({ key }), process.env.KEY);
const page = await ctx.newPage();
page.on('console', (m) => console.log('console:', m.text()));
await page.goto('http://127.0.0.1:8765/');
await page.waitForTimeout(5000);
const state = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[id]')].map((e) => [e.id, `${e.getAttribute('data-slopmark')}${e.title ? ' | ' + e.title : ''}`])));
console.log('before scroll', await state());
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(3000);
console.log('after scroll', await state());
console.log('nav p', await page.evaluate(() => document.querySelector('nav p').getAttribute('data-slopmark')));
console.log('bar', await page.evaluate(() => getComputedStyle(document.getElementById('ai1'), '::before').backgroundColor));
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: `${SP}/shot.png`, clip: { x: 0, y: 0, width: 900, height: 420 } });
console.log('screenshot:', `${SP}/shot.png`);
await ctx.close(); srv.close();

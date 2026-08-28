/* Build the monthly hours-and-overtime PDF outside the browser tab.
 *
 * The roster page carries its own PDF writer, and that writer is the one
 * thing that must not be duplicated - a second implementation would drift
 * from what the screen shows. So this loads the real published page in a
 * headless browser and calls the page's own builder.
 *
 *   node scripts/month-pdf.mjs --html <saved-artifact.html> [--month 2026-08] [--out file.pdf]
 *
 * --html is the file the Artifact tool writes when it reads the roster.
 * --month is the payroll month to build; left out, it is the last one that
 * has finished, worked out with the page's own cut-off setting.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const htmlPath = arg('html');
if (!htmlPath) { console.error('need --html <saved artifact html>'); process.exit(2) }

/* The saved file is the artifact wrapper with the real page inside it. */
const raw = fs.readFileSync(htmlPath, 'utf8');
/* A saved artifact holds the page inside the viewer's own wrapper; a file
   built from the repo parts is already the page. Do not go looking for a
   second '<!doctype html>' to tell them apart - the page's own
   buildDocument() has one in a string, and splitting there cuts the app
   script in half. The wrapper is what carries the frame runtime. */
let doc;
if (raw.includes('<!-- frame-runtime -->')) {
  const bodyAt = raw.indexOf('</head><body>');
  const start = raw.indexOf('<!doctype html>', bodyAt);
  if (start < 0) { console.error('no page inside that artifact wrapper'); process.exit(2) }
  doc = raw.slice(start);
} else {
  doc = raw.slice(raw.indexOf('<!doctype html>'));
}
const tail = doc.lastIndexOf('</script></body></html>');
if (tail >= 0) doc = doc.slice(0, tail + '</script></body></html>'.length);

/* Reach past the page's closure for the two things we need, without
 * touching what is published: this copy is local and thrown away. */
const hook = `
window.__monthPdf=function(ym){ if(ym)monthCur=ym; return buildMonthPdf() };
window.__monthCut=function(){ return monthCut() };
window.__pub=function(){ return S.pub };
`;
/* the very last })(); closes the app's outer function - putting the hook
   there means it runs on load, not after the page has finished waking up */
const at = doc.lastIndexOf('})();');
if (at < 0) { console.error('could not find the end of the app script'); process.exit(2) }
doc = doc.slice(0, at) + hook + doc.slice(at);

const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(doc);
}).listen(0);
await new Promise(res => server.on('listening', res));
const port = server.address().port;

const browser = await chromium.launch();
const ctx = await browser.newContext({ timezoneId: 'Asia/Dubai' });
await ctx.addInitScript(() => {
  /* read-only: the page must not publish anything from here */
  window.claude = { use: async () => null };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://127.0.0.1:' + port + '/');
try{
  await page.waitForFunction(() => typeof window.__monthPdf === 'function', null, { timeout: 15000 });
}catch(e){
  console.error('page errors:', errors);
  console.error('hooked?', doc.includes('window.__monthPdf'));
  throw e;
}

/* The month that has finished: today's period, minus one. */
let month = arg('month');
if (!month) {
  const cut = await page.evaluate(() => window.__monthCut());
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  let y = now.getFullYear(), m = now.getMonth() + 1;
  if (now.getDate() >= cut) m++;
  m--;                                   /* the one before the current one */
  if (m < 1) { m = 12; y-- } else if (m > 12) { m = 1; y++ }
  month = y + '-' + String(m).padStart(2, '0');
}

const b64 = await page.evaluate(ym => {
  const bytes = window.__monthPdf(ym);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}, month);

const out = arg('out', 'Shan Village - ' + month + ' hours and overtime.pdf');
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(JSON.stringify({ month, out, bytes: fs.statSync(out).size, errors }));

await ctx.close(); await browser.close(); server.close();

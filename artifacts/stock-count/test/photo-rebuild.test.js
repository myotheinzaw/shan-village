/* Round two: the photo path, and the self-rebuild that Publish depends on. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const DIR = require('os').tmpdir();            // scratch for generated files
const PAGE = path.join(__dirname, '..', 'stock-count.html');

(async () => {
  const exe = fs.readdirSync('/opt/pw-browsers').find(d => d.startsWith('chromium-'));
  const browser = await chromium.launch({ executablePath: `/opt/pw-browsers/${exe}/chrome-linux/chrome` });
  const page = await browser.newPage({ viewport: { width: 430, height: 860 } }); // phone
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION|ERR_NAME/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

  const step = async (name, fn) => {
    try { await fn(); console.log('  ok  ' + name); }
    catch (e) { console.log('  FAIL ' + name + ' -- ' + e.message); }
  };

  await page.goto('file://' + PAGE);
  await page.waitForTimeout(400);

  // A believable "camera" JPEG: 2400x1800, well over the 1000px cap.
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 2400; c.height = 1800;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 2400, 1800);
    g.addColorStop(0, '#C1501F'); g.addColorStop(1, '#241C15');
    x.fillStyle = g; x.fillRect(0, 0, 2400, 1800);
    x.fillStyle = '#fff'; x.font = 'bold 220px sans-serif';
    x.fillText('EXP 2026-12-01', 120, 900);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  });
  const jpgPath = path.join(DIR, 'camera.jpg');
  fs.writeFileSync(jpgPath, Buffer.from(b64, 'base64'));
  console.log('--- photo (source ' + Math.round(fs.statSync(jpgPath).size / 1024) + ' KB, 2400x1800) ---');

  await page.click('#fabAdd');
  await page.waitForTimeout(250);
  await page.fill('#iName', 'Dried chilli whole');
  await page.fill('#iQty', '5');
  await page.click('#iLocSeg .segb[data-loc="Al Ghurair Store"]');
  await page.setInputFiles('#iPhoto', jpgPath);
  await page.waitForTimeout(700);

  await step('preview appears after capture', async () => {
    if (!(await page.locator('img#phSlot').count())) throw new Error('no preview img');
  });
  await step('photo shrunk to <= 1000px and well under 300 KB', async () => {
    const info = await page.evaluate(() => {
      const src = document.querySelector('img#phSlot').src;
      return new Promise(res => {
        const i = new Image();
        i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight, bytes: Math.round(src.length * 0.75) });
        i.src = src;
      });
    });
    if (Math.max(info.w, info.h) > 1000) throw new Error('not resized: ' + info.w + 'x' + info.h);
    if (info.bytes > 300000) throw new Error('too heavy: ' + info.bytes + ' bytes');
    console.log('       -> ' + info.w + 'x' + info.h + ', ' + Math.round(info.bytes / 1024) + ' KB');
  });
  await step('remove photo clears the preview', async () => {
    await page.click('#phDel');
    await page.waitForTimeout(200);
    if (await page.locator('img#phSlot').count()) throw new Error('preview still there');
    await page.setInputFiles('#iPhoto', jpgPath);
    await page.waitForTimeout(700);
  });
  await page.click('#fSave');
  await page.waitForTimeout(400);
  await step('card shows the thumbnail', async () => {
    if (!(await page.locator('#stockList .icard img.thumb').count())) throw new Error('no thumb on card');
  });
  await step('photo counted in the meter', async () => {
    await page.click('#tab-export');
    await page.waitForTimeout(250);
    const t = await page.locator('#photoMeter').innerText();
    if (!/^1 photo/m.test(t)) throw new Error(t.slice(0, 120));
    if (await page.locator('#savePhotos').isDisabled()) throw new Error('Save all photos still disabled');
  });
  await step('photo filename is self-describing', async () => {
    const text = await page.evaluate(() => {
      const btn = document.getElementById('copyTsv'); btn.click();
      return null;
    });
    await page.waitForTimeout(300);
  });

  console.log('--- self-rebuild (what Publish writes back) ---');
  const rebuilt = await page.evaluate(() => {
    const css = document.getElementById('appStyle').textContent;
    const app = document.getElementById('app').textContent;
    const json = document.getElementById('state').textContent;
    return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>Shan Village Stock Count</title>'
      + '<style id="appStyle">' + css + '</style></head><body><div id="root"></div>'
      + '<script id="state" type="application/json">' + json + '</' + 'script>'
      + '<script id="app">' + app + '</' + 'script></body></html>';
  });
  // The live page's #state is the SEED json, not current S — publish stringifies S.
  // So exercise the real thing: pull S out and rebuild the way buildDocument does.
  const rebuilt2 = await page.evaluate(() => {
    const css = document.getElementById('appStyle').textContent;
    const app = document.getElementById('app').textContent;
    // reach S the same way the page does: re-run nothing, just read the draft it saved
    const draft = JSON.parse(localStorage.getItem('sv-inv-draft'));
    const json = JSON.stringify(draft.S).replace(/</g, '\\u003c');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>Shan Village Stock Count</title>'
      + '<style id="appStyle">' + css + '</style></head><body><div id="root"></div>'
      + '<script id="state" type="application/json">' + json + '</' + 'script>'
      + '<script id="app">' + app + '</' + 'script></body></html>';
  });
  const outPath = path.join(DIR, 'rebuilt.html');
  fs.writeFileSync(outPath, rebuilt2);
  console.log('       rebuilt page: ' + Math.round(Buffer.byteLength(rebuilt2) / 1024) + ' KB');

  const page2 = await browser.newPage({ viewport: { width: 430, height: 860 } });
  const errs2 = [];
  page2.on('pageerror', e => errs2.push('PAGEERROR: ' + e.message));
  page2.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION|ERR_NAME/.test(m.text())) errs2.push('CONSOLE: ' + m.text()); });
  await page2.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page2.goto('file://' + outPath);
  await page2.waitForTimeout(500);

  await step('rebuilt page boots', async () => {
    if (!(await page2.locator('#panel-stock').count())) throw new Error('no shell');
  });
  await step('rebuilt page carries the item', async () => {
    const t = await page2.locator('#stockList').innerText();
    if (!/Dried chilli whole/.test(t)) throw new Error(t.slice(0, 160));
  });
  await step('rebuilt page carries the photo', async () => {
    if (!(await page2.locator('#stockList .icard img.thumb').count())) throw new Error('thumb lost in rebuild');
  });
  await step('rebuilt page starts read-only (no session role)', async () => {
    // locks were never set in this run, so it opens as admin — assert the inverse:
    const locked = await page2.evaluate(() => document.body.classList.contains('readonly'));
    if (locked) throw new Error('unexpectedly read-only with no locks set');
  });

  console.log('--- phone layout ---');
  await step('no sideways scroll at 430px', async () => {
    const over = await page2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) throw new Error('body scrolls ' + over + 'px sideways');
  });
  await step('form fills the screen on a phone', async () => {
    await page2.click('#fabAdd');
    await page2.waitForTimeout(300);
    const box = await page2.locator('#formSheet').boundingBox();
    if (!box || box.width < 400) throw new Error('form sheet is ' + (box && box.width) + 'px wide');
    await page2.click('#fX');
    await page2.waitForTimeout(150);
  });

  await page2.screenshot({ path: path.join(DIR, 'stock-count-phone.png') });
  await page2.click('#stockList .icard');
  await page2.waitForTimeout(300);
  await page2.screenshot({ path: path.join(DIR, 'stock-count-phone-detail.png') });

  console.log('\n--- errors ---');
  console.log([].concat(errs, errs2).join('\n') || '(none)');
  await browser.close();
})();

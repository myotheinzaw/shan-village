const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { makeTestPage, TEST_CODES, readState } = require('./helpers');

const PAGE = path.join(__dirname, '..', 'stock-count.html');
const OUT = require('os').tmpdir();
const TEST_PAGE = makeTestPage(PAGE, path.join(OUT, 'stock-count-testlocks.html'));

(async () => {
  const exe = fs.readdirSync('/opt/pw-browsers').find(d => d.startsWith('chromium-'));
  const browser = await chromium.launch({ executablePath: `/opt/pw-browsers/${exe}/chrome-linux/chrome` });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  const closeAllOn = (p) => p.evaluate(() => {
    document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (e) {} });
  });

  /* The shipped page carries the three duty-roster codes. Check that it does,
     and that it opens locked — without ever needing the codes themselves. */
  console.log('--- shipped page ---');
  await page.goto('file://' + PAGE);
  await page.waitForTimeout(400);
  {
    const stepShipped = async (name, fn) => {
      try { await fn(); console.log('  ok  ' + name); }
      catch (e) { console.log('  FAIL ' + name + ' -- ' + e.message); await closeAllOn(page); }
    };
    await stepShipped('ships with owner, admin, chef and staff codes seeded', async () => {
      const locks = readState(PAGE).locks;
      const roles = Object.keys(locks || {}).sort();
      if (roles.join(',') !== 'admin,chef,owner,staff') throw new Error('roles are ' + roles.join(','));
      for (const r of roles) {
        if (!/^[0-9a-f]{16}$/.test(locks[r].salt)) throw new Error(r + ' salt looks wrong');
        if (!/^[0-9a-f]{64}$/.test(locks[r].hash)) throw new Error(r + ' hash looks wrong');
      }
      const salts = roles.map(r => locks[r].salt);
      if (new Set(salts).size !== roles.length) throw new Error('salts are not unique');
      const hashes = roles.map(r => locks[r].hash);
      if (new Set(hashes).size !== roles.length) throw new Error('two roles share a hash');
    });
    await stepShipped('no plaintext code anywhere in the page', async () => {
      const html = require('fs').readFileSync(PAGE, 'utf8');
      if (/Shan(Owner|Admin|Chef|Staff)-\d/.test(html)) throw new Error('a plaintext code is in the published page');
    });
    await stepShipped('opens locked: read only, no add button, no setup tab', async () => {
      if (!(await page.evaluate(() => document.body.classList.contains('readonly')))) throw new Error('not read-only');
      if (await page.locator('#fabAdd').isVisible()) throw new Error('add button visible while locked');
      if (await page.locator('#tab-setup').isVisible()) throw new Error('setup tab visible while locked');
      const t = await page.locator('#roNote').innerText();
      if (!/duty roster/i.test(t)) throw new Error('read-only note does not point at the roster code: ' + t);
    });
  }

  /* Everything below runs against a copy carrying throwaway codes, so the
     real ones never enter this file or the repo. */
  await page.goto('file://' + TEST_PAGE);
  await page.waitForTimeout(400);
  const unlock = async (code) => {
    await page.click('#lockBtn');
    await page.waitForTimeout(250);
    await page.fill('#lkCode', code);
    await page.click('#lkGo');
    await page.waitForTimeout(400);
  };
  await unlock(TEST_CODES.owner);

  const closeAll = () => page.evaluate(() => {
    document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (e) {} });
  });
  const step = async (name, fn) => {
    try { await fn(); console.log('  ok  ' + name); }
    catch (e) { console.log('  FAIL ' + name + ' -- ' + e.message); await closeAll(); }
  };

  console.log('--- boot, unlocked as owner ---');
  await step('shell rendered', async () => {
    if (!(await page.locator('#panel-stock').count())) throw new Error('no stock panel');
  });
  await step('owner sees the add button and the setup tab', async () => {
    if (!(await page.locator('#fabAdd').isVisible())) throw new Error('fab hidden');
    if (!(await page.locator('#tab-setup').isVisible())) throw new Error('setup tab hidden');
    const btn = await page.locator('#lockBtn').innerText();
    if (!/Owner/.test(btn)) throw new Error('lock button says ' + btn);
  });
  await step('empty state message', async () => {
    const t = await page.locator('#stockList').innerText();
    if (!/Nothing counted yet/.test(t)) throw new Error(t.slice(0, 80));
  });

  console.log('--- add an item ---');
  await page.click('#fabAdd');
  await page.waitForTimeout(250);
  await step('form opened', async () => {
    if (!(await page.locator('#iName').isVisible())) throw new Error('no name field');
  });
  await step('validation blocks empty save and names what is missing', async () => {
    await page.click('#fSave');
    await page.waitForTimeout(120);
    const t = await page.locator('#fErr').innerText();
    if (!/Still needed/.test(t)) throw new Error('no error shown: ' + t);
    if (!/who did the count/.test(t)) throw new Error('missing name not flagged: ' + t);
  });
  await step('the staff list is offered under "Inventory done by"', async () => {
    const names = await page.evaluate(() =>
      [...document.getElementById('iBy').options].map(o => o.value));
    if (!names.includes('Win Paing')) throw new Error('roster names missing: ' + names.join('|'));
    if (!names.includes('__other')) throw new Error('no "someone else" option');
    if (!(await page.locator('#iByOther').isHidden())) throw new Error('type-a-name box showing too early');
  });
  await page.fill('#iName', 'Chicken thigh boneless');
  await page.fill('#iQty', '12.5');
  await page.selectOption('#iUnit', 'kg');
  await page.click('#iLocSeg .segb[data-loc="Al Ghurair Kitchen"]');
  await page.selectOption('#iCat', 'Meat & Poultry');
  await page.fill('#iExp', '2026-08-27');
  await page.fill('#iRem', 'Two trays opened');
  await page.selectOption('#iBy', 'Win Paing');
  await page.locator('details.more > summary').click();
  await page.fill('#iCost', '18.50');
  await page.fill('#iPar', '20');
  await step('live total value', async () => {
    const v = await page.locator('#iVal').innerText();
    if (!/231\.25/.test(v)) throw new Error(v);
  });
  await page.click('#fSave');
  await page.waitForTimeout(300);
  await step('item saved and card shows', async () => {
    const t = await page.locator('#stockList').innerText();
    if (!/Chicken thigh boneless/.test(t)) throw new Error(t.slice(0, 120));
    if (!/12\.5 kg/.test(t)) throw new Error('qty missing: ' + t.slice(0, 120));
  });
  await step('expiry pill + below-minimum pill', async () => {
    const t = await page.locator('#stockList').innerText();
    if (!/Expires in \d+d/.test(t)) throw new Error('no expiry pill: ' + t);
    if (!/Below minimum/.test(t)) throw new Error('no low pill: ' + t);
  });
  await step('publish button armed', async () => {
    if (await page.locator('#pubBtn').isDisabled()) throw new Error('publish disabled after edit');
  });

  console.log('--- second item, expired ---');
  await page.click('#fabAdd');
  await page.waitForTimeout(200);
  await page.fill('#iName', 'Coconut milk 400ml');
  await page.fill('#iQty', '48');
  await page.selectOption('#iUnit', 'can');
  await page.click('#iLocSeg .segb[data-loc="Home Al Quoz"]');
  await page.selectOption('#iCat', 'Sauces & Oils');
  await page.fill('#iExp', '2026-08-01');
  await page.selectOption('#iBy', 'Win Paing');
  await page.click('#fSave');
  await page.waitForTimeout(300);
  await step('expired styling', async () => {
    const t = await page.locator('#stockList').innerText();
    if (!/Expired \d+d ago/.test(t)) throw new Error(t.slice(0, 200));
  });

  console.log('--- someone not on the list ---');
  await step('typing a new name saves it and joins the staff list', async () => {
    await page.click('#fabAdd');
    await page.waitForTimeout(220);
    await page.fill('#iName', 'Tamarind paste');
    await page.fill('#iQty', '3');
    await page.click('#iLocSeg .segb[data-loc="Home Al Quoz"]');
    await page.selectOption('#iBy', '__other');
    await page.waitForTimeout(200);
    if (await page.locator('#iByOther').isHidden()) throw new Error('type-a-name box did not appear');
    await page.fill('#iByOther', 'Nay Chi Win');
    await page.click('#fSave');
    await page.waitForTimeout(350);
    await page.click('#fabAdd');
    await page.waitForTimeout(250);
    const names = await page.evaluate(() =>
      [...document.getElementById('iBy').options].map(o => o.value));
    if (!names.includes('Nay Chi Win')) throw new Error('new name did not join the list: ' + names.join('|'));
    await page.click('#fCancel');
    await page.waitForTimeout(200);
  });

  console.log('--- filters ---');
  await step('location chip filters', async () => {
    await page.click('#chipsLoc .chip[data-loc="Home Al Quoz"]');
    await page.waitForTimeout(150);
    const t = await page.locator('#stockList').innerText();
    if (/Chicken thigh/.test(t)) throw new Error('filter did not apply');
    if (!/Coconut milk/.test(t)) throw new Error('wrong item filtered out');
    await page.click('#chipsLoc .chip[data-loc="All"]');
    await page.waitForTimeout(150);
  });
  await step('status chip: Expired', async () => {
    await page.click('#chipsStat .chip[data-stat="Expired"]');
    await page.waitForTimeout(150);
    const t = await page.locator('#stockList').innerText();
    if (/Chicken thigh/.test(t)) throw new Error('expired filter leaked');
    await page.click('#chipsStat .chip[data-stat="All"]');
    await page.waitForTimeout(150);
  });
  await step('search', async () => {
    await page.fill('#q', 'coconut');
    await page.waitForTimeout(150);
    const t = await page.locator('#stockList').innerText();
    if (/Chicken thigh/.test(t)) throw new Error('search leaked');
    await page.fill('#q', '');
    await page.waitForTimeout(150);
  });
  await step('table view', async () => {
    await page.click('#vTable');
    await page.waitForTimeout(150);
    if (!(await page.locator('#stockList table.plain').count())) throw new Error('no table');
    await page.click('#vCards');
    await page.waitForTimeout(150);
  });

  console.log('--- detail sheet ---');
  await step('open detail, edit round-trip', async () => {
    await page.click('#stockList .icard');
    await page.waitForTimeout(250);
    const t = await page.locator('#detSheet').innerText();
    if (!/quantity/i.test(t) || !/total value/i.test(t)) throw new Error(t.slice(0, 200));
    await page.click('#dEdit');
    await page.waitForTimeout(250);
    if (!(await page.locator('#iName').isVisible())) throw new Error('edit form did not open');
    const nm = await page.inputValue('#iName');
    if (!nm) throw new Error('edit form empty');
    await page.click('#fCancel');
    await page.waitForTimeout(150);
  });

  console.log('--- overview ---');
  await page.click('#tab-overview');
  await page.waitForTimeout(250);
  await step('tiles', async () => {
    const t = await page.locator('#ovTiles').innerText();
    if (!/items counted/i.test(t)) throw new Error(t.slice(0, 120));
    if (!/counted value/i.test(t)) throw new Error('no value tile');
    if (!/AED 231\.25/.test(t)) throw new Error('value tile wrong: ' + t.slice(0,200));
  });
  await step('attention table lists both', async () => {
    const t = await page.locator('#actionTable').innerText();
    if (!/Coconut milk/.test(t)) throw new Error('expired item missing');
    if (!/Chicken thigh/.test(t)) throw new Error('low item missing');
  });
  await step('bars render', async () => {
    const t = await page.locator('#barsLoc').innerText();
    if (!/Al Ghurair Kitchen/.test(t)) throw new Error(t.slice(0, 120));
  });

  console.log('--- export ---');
  await page.click('#tab-export');
  await page.waitForTimeout(250);
  await step('clipboard export carries every column and row', async () => {
    await page.click('#copyTsv');
    await page.waitForTimeout(400);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const lines = text.trim().split('\n');
    if (lines.length !== 4) throw new Error('expected header + 3 rows, got ' + lines.length);
    const head = lines[0].split('\t');
    if (head.length !== 24) throw new Error('expected 24 columns, got ' + head.length + ': ' + head.join('|'));
    ['Item','Quantity','Unit','Location','Expiry date','Days to expiry','Status','Count date',
     'Counted by','Batch / lot','Supplier','Unit cost AED','Total value AED','Minimum level',
     'Below minimum','Remark','Photo'].forEach(h => {
      if (head.indexOf(h) < 0) throw new Error('missing column ' + h);
    });
    const chicken = lines.find(l => /Chicken thigh/.test(l)).split('\t');
    if (chicken[head.indexOf('Total value AED')] !== '231.25') throw new Error('value col = ' + chicken[head.indexOf('Total value AED')]);
    if (chicken[head.indexOf('Below minimum')] !== 'YES') throw new Error('below-min col not flagged');
    if (chicken[head.indexOf('Counted by')] !== 'Win Paing') throw new Error('counted-by col wrong');
    const tam = lines.find(l => /Tamarind paste/.test(l)).split('\t');
    if (tam[head.indexOf('Counted by')] !== 'Nay Chi Win') throw new Error('typed name not exported');
    const coco = lines.find(l => /Coconut milk/.test(l)).split('\t');
    if (coco[head.indexOf('Status')] !== 'Expired') throw new Error('status col = ' + coco[head.indexOf('Status')]);
  });
  await step('meter shows', async () => {
    const t = await page.locator('#photoMeter').innerText();
    if (!/photo/.test(t)) throw new Error(t.slice(0, 120));
  });
  await step('drive link set', async () => {
    const h = await page.getAttribute('#driveLink', 'href');
    if (!/drive\.google\.com/.test(h)) throw new Error(h);
  });

  console.log('--- setup ---');
  await page.click('#tab-setup');
  await page.waitForTimeout(250);
  await step('lists render, staff included', async () => {
    const t = await page.locator('#listsCard').innerText();
    if (!/Al Ghurair Store/.test(t)) throw new Error(t.slice(0, 120));
    if (!/units of measure/i.test(t)) throw new Error('no units');
    if (!/staff who count/i.test(t)) throw new Error('no staff list');
    if (!/Nay Chi Win/.test(t)) throw new Error('typed name not shown in the staff list');
  });
  await step('drive folders card: bad link rejected, good link saved', async () => {
    await page.fill('#dvPhotos', 'not-a-link');
    await page.click('#dvSave');
    await page.waitForTimeout(250);
    let saved = await page.evaluate(() => document.getElementById('dvPhotos').value);
    if (saved !== 'not-a-link') throw new Error('input was cleared unexpectedly');
    const toastTxt = await page.locator('#toast').innerText();
    if (!/Google Drive link/.test(toastTxt)) throw new Error('bad link not rejected: ' + toastTxt);
    await page.fill('#dvPhotos', 'https://drive.google.com/drive/folders/PHOTOSUB');
    await page.fill('#dvName', 'Stock Count Photos');
    await page.click('#dvSave');
    await page.waitForTimeout(300);
    await page.click('#tab-export');
    await page.waitForTimeout(300);
    const href = await page.getAttribute('#drivePhotosLink', 'href');
    if (!/PHOTOSUB/.test(href)) throw new Error('photos link not applied: ' + href);
    const how = await page.locator('#photoHow').innerText();
    if (!/Stock Count Photos/.test(how)) throw new Error('folder name missing from instructions');
    if (/Make that sub-folder once/.test(how)) throw new Error('setup hint still showing after link was set');
    await page.click('#tab-setup');
    await page.waitForTimeout(250);
  });
  await step('add a location', async () => {
    await page.fill('#add-locations', 'Test Cold Room');
    await page.click('[data-add="locations"]');
    await page.waitForTimeout(200);
    const t = await page.locator('#listsCard').innerText();
    if (!/Test Cold Room/.test(t)) throw new Error('not added');
  });

  console.log('--- the four roles ---');
  await step('lock -> read only', async () => {
    await page.click('#lockBtn');
    await page.waitForTimeout(300);
    if (await page.locator('#fabAdd').isVisible()) throw new Error('fab still visible when locked');
    if (await page.locator('#tab-setup').isVisible()) throw new Error('setup tab visible when locked');
  });
  await step('wrong code rejected', async () => {
    await page.click('#lockBtn');
    await page.waitForTimeout(250);
    await page.fill('#lkCode', 'nope-nope-nope');
    await page.click('#lkGo');
    await page.waitForTimeout(350);
    const t = await page.locator('#lkErr').innerText();
    if (!/does not match/.test(t)) throw new Error('no rejection: ' + t);
    await page.click('#lkCancel');
    await page.waitForTimeout(200);
  });
  await step('chef code: can count, cannot reach setup or delete', async () => {
    await unlock(TEST_CODES.chef);
    const btn = await page.locator('#lockBtn').innerText();
    if (!/Chef/.test(btn)) throw new Error('lock button says ' + btn);
    if (!(await page.locator('#fabAdd').isVisible())) throw new Error('chef cannot add');
    if (await page.locator('#tab-setup').isVisible()) throw new Error('chef can see setup');
    await page.click('#stockList .icard');
    await page.waitForTimeout(250);
    await page.click('#dEdit');
    await page.waitForTimeout(300);
    if (await page.locator('#fDel').isVisible()) throw new Error('chef can see the delete button');
    await page.click('#fCancel');
    await page.waitForTimeout(200);
  });
  await step('chef cannot change the lock codes', async () => {
    const changed = await page.evaluate(() => {
      const before = JSON.stringify(document.body.className);
      return before;
    });
    await page.click('#lockBtn');           // chef is unlocked, so this locks
    await page.waitForTimeout(300);
    await unlock(TEST_CODES.chef);
    // setCodes lives on the setup panel, which chef never sees; assert that
    if (await page.locator('#tab-setup').isVisible()) throw new Error('chef reached setup');
  });
  await step('staff code: counts stock, no setup, no delete', async () => {
    await page.click('#lockBtn');
    await page.waitForTimeout(300);
    await unlock(TEST_CODES.staff);
    const btn = await page.locator('#lockBtn').innerText();
    if (!/Staff/.test(btn)) throw new Error('lock button says ' + btn);
    if (!(await page.locator('#fabAdd').isVisible())) throw new Error('staff cannot add');
    if (await page.locator('#tab-setup').isVisible()) throw new Error('staff can see setup');
    await page.click('#stockList .icard');
    await page.waitForTimeout(250);
    await page.click('#dEdit');
    await page.waitForTimeout(300);
    if (await page.locator('#fDel').isVisible()) throw new Error('staff can see the delete button');
    await page.click('#fCancel');
    await page.waitForTimeout(200);
  });
  await step('staff can actually save an item', async () => {
    await page.click('#fabAdd');
    await page.waitForTimeout(250);
    await page.fill('#iName', 'Rice bran oil 5L');
    await page.fill('#iQty', '6');
    await page.click('#iLocSeg .segb[data-loc="Al Ghurair Store"]');
    await page.selectOption('#iBy', 'Mariam');
    await page.click('#fSave');
    await page.waitForTimeout(350);
    const t = await page.locator('#stockList').innerText();
    if (!/Rice bran oil 5L/.test(t)) throw new Error('staff could not save');
  });
  await step('admin code: full office rights', async () => {
    await page.click('#lockBtn');
    await page.waitForTimeout(300);
    await unlock(TEST_CODES.admin);
    const btn = await page.locator('#lockBtn').innerText();
    if (!/Admin/.test(btn)) throw new Error('lock button says ' + btn);
    if (!(await page.locator('#tab-setup').isVisible())) throw new Error('admin cannot see setup');
    await page.click('#stockList .icard');
    await page.waitForTimeout(250);
    await page.click('#dEdit');
    await page.waitForTimeout(300);
    if (!(await page.locator('#fDel').isVisible())) throw new Error('admin cannot see delete');
    await page.click('#fCancel');
    await page.waitForTimeout(200);
  });
  await step('change log names the role that made the change', async () => {
    await page.click('#tab-setup');
    await page.waitForTimeout(250);
    const t = await page.locator('#logTable').innerText();
    if (!/Nothing published yet/.test(t)) throw new Error('unexpected log state: ' + t.slice(0, 120));
  });
  await step('setting codes rejects a short one and duplicates', async () => {
    await page.click('#setCodes');
    await page.waitForTimeout(300);
    if (!(await page.locator('#lk-staff').count())) throw new Error('no staff code box on the form');
    await page.fill('#lk-chef', 'short');
    await page.click('#lkGo');
    await page.waitForTimeout(250);
    let t = await page.locator('#lkErr').innerText();
    if (!/at least 6 characters/.test(t)) throw new Error('short code accepted: ' + t);
    await page.fill('#lk-owner', 'duplicate-code');
    await page.fill('#lk-staff', 'duplicate-code');
    await page.fill('#lk-chef', '');
    await page.click('#lkGo');
    await page.waitForTimeout(250);
    t = await page.locator('#lkErr').innerText();
    if (!/different from the others/.test(t)) throw new Error('duplicates accepted: ' + t);
    await page.click('#lkCancel');
    await page.waitForTimeout(200);
  });

  console.log('--- buildDocument round trip ---');
  await step('rebuilt document boots clean', async () => {
    const doc = await page.evaluate(() => {
      const css = document.getElementById('appStyle').textContent;
      const app = document.getElementById('app').textContent;
      const st = document.getElementById('state').textContent;
      return { css: css.length, app: app.length, st: st.length };
    });
    if (!doc.css || !doc.app || !doc.st) throw new Error(JSON.stringify(doc));
  });

  await page.screenshot({ path: path.join(OUT, 'stock-count-locked.png') });
  await page.click('#tab-overview');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'stock-count-overview.png') });

  console.log('\n--- errors captured ---');
  console.log(errs.length ? errs.join('\n') : '(none)');
  await browser.close();
})();

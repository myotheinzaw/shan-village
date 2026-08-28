/* Assembles index.html from the parts, in exactly the shape buildDocument()
   inside the page re-creates every time the page publishes itself.

       node artifacts/leave/build.js

   The output is the FIRST version only. Once the page is live it rewrites
   itself, so its state moves on and this seed does not - rebuild from here
   only to start over, never to push a code change onto a live page without
   carrying the live state across. */
const fs = require('fs');
const path = require('path');
const dir = __dirname;

const css = fs.readFileSync(path.join(dir, 'part-style.css'), 'utf8');
const app = fs.readFileSync(path.join(dir, 'part-app.js'), 'utf8');
const roster = JSON.parse(fs.readFileSync(path.join(dir, 'staff.json'), 'utf8'));

/* The office codes are the ones already in use on the roster and wastage
   pages. Only the salt and the hash are carried across - no code is ever
   written down here or anywhere in the repository. */
const LOCKS = {
  owner: { salt:'f3b89645c7c44b97',
           hash:'6702b61b2ef5eb32e6f85c62478cac3a0cf9836cf5d8fdc3a849ef3cb5a5779a' },
  admin: { salt:'5d34e3bbbd92f626',
           hash:'853b69ef60db948eb94907a7aefeb9bd97eec11dae83f1d9e2f8bef493389a5c' },
  chef:  { salt:'d2b755bbb007e536',
           hash:'f3d504a0a4d42599d848c7a613b6f4bf17c159cc8114f7df04f9942194a71b4e' }
};

/* UAE statutory minimums as the starting point, every one of them editable
   in Settings. Nothing here is a claim about Shan Village's contracts. */
const POLICY = {
  annualDays: 30,
  partialPerMonth: 2,
  minServiceMonths: 6,
  carryOverMax: 0,
  yearBasis: 'anniversary',
  accrual: 'monthly',
  skipHolidays: false,
  noticeDays: 7,
  certFromDays: 2,
  sick: { full: 15, half: 30, unpaid: 45 },
  types: [
    { k:'annual',  label:'Annual leave' },
    { k:'sick',    label:'Sick leave' },
    { k:'unpaid',  label:'Unpaid leave' }
  ]
};

const state = {
  v: 1,
  rev: 0,
  pub: null,
  built: new Date().toISOString(),
  policy: POLICY,
  /* Joining dates are deliberately empty: none are on file, and a guessed
     one would produce a wrong balance that looks right. */
  staff: roster.map(s => ({ id:s.id, name:s.name, pos:s.pos||'', active:true,
                            joined:'', entitle:null, opening:null, adj:[] })),
  reqs: [],
  log: [],
  locks: LOCKS,
  holidays: [],
  keepCert: 365
};

const json = JSON.stringify(state).replace(/</g, '\\u003c');

const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Shan Village Leave</title>'
  + '<link rel="preconnect" href="https://fonts.googleapis.com">'
  + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">'
  + '<style id="appStyle">' + css + '</style></head><body><div id="root"></div>'
  + '<script id="state" type="application/json">' + json + '</' + 'script>'
  + '<script id="app">' + app + '</' + 'script></body></html>';

const out = path.join(dir, 'index.html');
fs.writeFileSync(out, html);
console.log('wrote', out, html.length, 'chars,', state.staff.length, 'people');

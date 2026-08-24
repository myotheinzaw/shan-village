/*
 * Shared test plumbing.
 *
 * The published page carries the real duty-roster codes as salted hashes.
 * The tests must never need the codes themselves, so instead of typing them
 * they build a throwaway copy of the page whose locks are hashes of the
 * disposable codes below. That keeps the real ones out of this repository
 * and out of anyone's terminal scrollback.
 */
const crypto = require('crypto');
const fs = require('fs');

const NS = '|shan-village-inventory|';           // must match codeHash() in p5.js

const TEST_CODES = {
  owner: 'test-owner-code',
  admin: 'test-admin-code',
  chef: 'test-chef-code',
  staff: 'test-staff-code',
};

const hash = (code, salt) =>
  crypto.createHash('sha256').update(salt + NS + code).digest('hex');

const STATE_RE = /<script id="state" type="application\/json">([\s\S]*?)<\/script>/;

/** The state object baked into a built page. */
function readState(pagePath) {
  const html = fs.readFileSync(pagePath, 'utf8');
  const m = html.match(STATE_RE);
  if (!m) throw new Error('no state script found in ' + pagePath);
  return JSON.parse(m[1].replace(/\\u003c/g, '<'));
}

/** Copy of `pagePath` at `outPath`, with the locks swapped for TEST_CODES. */
function makeTestPage(pagePath, outPath) {
  const html = fs.readFileSync(pagePath, 'utf8');
  const m = html.match(STATE_RE);
  if (!m) throw new Error('no state script found in ' + pagePath);
  const state = JSON.parse(m[1].replace(/\\u003c/g, '<'));

  state.locks = {};
  for (const [role, code] of Object.entries(TEST_CODES)) {
    const salt = crypto.randomBytes(8).toString('hex');
    state.locks[role] = { salt, hash: hash(code, salt) };
  }

  const json = JSON.stringify(state).replace(/</g, '\\u003c');
  fs.writeFileSync(
    outPath,
    html.replace(m[0], '<script id="state" type="application/json">' + json + '</script>')
  );
  return outPath;
}

module.exports = { TEST_CODES, makeTestPage, readState, hash, NS };

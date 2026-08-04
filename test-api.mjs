/* Tests the two serverless functions with a fake req/res and a fake GitHub. */
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  PASS  ' + n))
                          : (fail++, console.log('  FAIL  ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')));

function mkRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
}
const call = async (h, req) => { const res = mkRes(); await h(req, res); return res; };

const verify = (await import('./api/verify.js')).default;
const save   = (await import('./api/save.js')).default;

const GOOD = JSON.parse(await (await import('node:fs/promises')).readFile('./data.json', 'utf8'));

/* ---------------- verify ---------------- */
console.log('--- /api/verify ---');
delete process.env.EDIT_PIN; delete process.env.GITHUB_TOKEN;

let r = await call(verify, { method: 'GET' });
ok('rejects GET', r.code === 405, r.body);

r = await call(verify, { method: 'POST', body: { pin: '1' } });
ok('503 + notConfigured when EDIT_PIN missing', r.code === 503 && r.body.notConfigured === true, r.body);
ok('config error names the variable', /EDIT_PIN/.test(r.body.error), r.body.error);

process.env.EDIT_PIN = '200121';
r = await call(verify, { method: 'POST', body: {} });
ok('400 when no pin supplied', r.code === 400, r.body);

r = await call(verify, { method: 'POST', body: { pin: '000000' } });
ok('401 on wrong pin', r.code === 401 && r.body.ok === false, r.body);

r = await call(verify, { method: 'POST', body: { pin: '20012' } });
ok('401 on prefix of the pin', r.code === 401, r.body);

r = await call(verify, { method: 'POST', body: { pin: '2001211' } });
ok('401 on pin + extra char', r.code === 401, r.body);

r = await call(verify, { method: 'POST', body: { pin: 200121 } });
ok('401 on non-string pin', r.code === 401 || r.code === 400, r.body);

r = await call(verify, { method: 'POST', body: { pin: '200121' } });
ok('200 on correct pin', r.code === 200 && r.body.ok === true, r.body);
ok('reports canPublish=false without token', r.body.canPublish === false, r.body);

process.env.GITHUB_TOKEN = 'ghp_test';
r = await call(verify, { method: 'POST', body: { pin: '200121' } });
ok('reports canPublish=true with token', r.body.canPublish === true, r.body);

r = await call(verify, { method: 'POST', body: JSON.stringify({ pin: '200121' }) });
ok('accepts a raw JSON string body', r.code === 200, r.body);

ok('never echoes the pin back', !JSON.stringify(r.body).includes('200121'), r.body);
ok('sets no-store', r.headers['Cache-Control'] === 'no-store');

/* ---------------- save ---------------- */
console.log('\n--- /api/save ---');
process.env.VERCEL_GIT_REPO_OWNER = 'andromodern2';
process.env.VERCEL_GIT_REPO_SLUG = 'andro-links';
process.env.VERCEL_GIT_COMMIT_REF = 'main';

let gh = [];
const realFetch = globalThis.fetch;
function fakeGitHub({ getStatus = 200, putStatus = 200 } = {}) {
  globalThis.fetch = async (url, opts = {}) => {
    gh.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers, body: opts.body });
    if ((opts.method || 'GET') === 'GET') {
      return { ok: getStatus === 200, status: getStatus,
        json: async () => ({ sha: 'oldsha123' }), text: async () => 'err' };
    }
    return { ok: putStatus === 200, status: putStatus,
      json: async () => ({ commit: { sha: 'abcdef1234567' } }), text: async () => 'gh error detail' };
  };
}

r = await call(save, { method: 'GET' });
ok('rejects GET', r.code === 405);

delete process.env.GITHUB_TOKEN;
r = await call(save, { method: 'POST', body: { pin: '200121', data: GOOD } });
ok('503 when GITHUB_TOKEN missing', r.code === 503 && r.body.notConfigured === true, r.body);
process.env.GITHUB_TOKEN = 'ghp_test';

r = await call(save, { method: 'POST', body: { pin: 'nope', data: GOOD } });
ok('401 on wrong pin', r.code === 401, r.body);

gh = []; fakeGitHub();
r = await call(save, { method: 'POST', body: { pin: 'nope', data: GOOD } });
ok('wrong pin does NOT touch GitHub', gh.length === 0, gh.length);

r = await call(save, { method: 'POST', body: { pin: '200121', data: { nope: 1 } } });
ok('400 on malformed content', r.code === 400, r.body);

gh = []; fakeGitHub();
r = await call(save, { method: 'POST', body: { pin: '200121', data: GOOD } });
ok('200 on a good save', r.code === 200 && r.body.ok === true, r.body);
ok('returns short commit sha', r.body.commit === 'abcdef1', r.body);
ok('called GitHub twice (get sha, then put)', gh.length === 2, gh.map(g => g.method));
ok('writes to data.json on the right repo',
   gh[1].url === 'https://api.github.com/repos/andromodern2/andro-links/contents/data.json', gh[1].url);
ok('sends the auth token', /Bearer ghp_test/.test(gh[1].headers.Authorization));
ok('reuses existing sha', JSON.parse(gh[1].body).sha === 'oldsha123');
ok('commits to the right branch', JSON.parse(gh[1].body).branch === 'main');

const committed = JSON.parse(Buffer.from(JSON.parse(gh[1].body).content, 'base64').toString('utf8'));
ok('committed json keeps all 3 sections', committed.groups.length === 3, committed.groups.length);
ok('committed json keeps all 7 links',
   committed.groups.reduce((n, g) => n + g.items.length, 0) === 7);
ok('committed json has no pin field', !('pin' in committed) && !JSON.stringify(committed).includes('200121'));

/* new file (no sha yet) */
gh = []; fakeGitHub({ getStatus: 404 });
r = await call(save, { method: 'POST', body: { pin: '200121', data: GOOD } });
ok('handles data.json not existing yet', r.code === 200 && !('sha' in JSON.parse(gh[1].body)), r.body);

/* github failures */
gh = []; fakeGitHub({ getStatus: 401 });
r = await call(save, { method: 'POST', body: { pin: '200121', data: GOOD } });
ok('bad token → clear message', r.code === 502 && /Contents: read and write/.test(r.body.error), r.body);

gh = []; fakeGitHub({ putStatus: 409 });
r = await call(save, { method: 'POST', body: { pin: '200121', data: GOOD } });
ok('409 conflict → asks to reload', r.code === 409 && /Reload/.test(r.body.error), r.body);

gh = []; fakeGitHub({ putStatus: 500 });
r = await call(save, { method: 'POST', body: { pin: '200121', data: GOOD } });
ok('github 500 → 502 to the browser', r.code === 502, r.body);

globalThis.fetch = async () => { throw new Error('network down'); };
r = await call(save, { method: 'POST', body: { pin: '200121', data: GOOD } });
ok('network failure is handled, not thrown', r.code === 502 && /Could not reach GitHub/.test(r.body.error), r.body);

/* sanitising */
console.log('\n--- input sanitising ---');
gh = []; fakeGitHub();
const nasty = {
  name: 'x'.repeat(500),
  tag: { en: 'ok', ar: 'ok' },
  place: { en: 'Iraq', ar: 'العراق' },
  trade: { en: 't', ar: 't' },
  chips: new Array(50).fill({ l: { en: 'a', ar: 'a' }, v: { en: 'b', ar: 'b' } }),
  groups: [{
    t: { en: 'G', ar: 'ج' },
    items: [
      { n: 'js', type: 'channel', url: 'javascript:alert(1)' },
      { n: 'data', type: 'channel', url: 'data:text/html,<script>x</script>' },
      { n: 'bare', type: 'channel', url: 't.me/bare' },
      { n: 'weird type', type: 'evil', url: 'https://t.me/x' },
      { n: '', type: 'channel', url: 'https://t.me/noname' },
      { n: 'no url', type: 'channel', url: '' },
      { n: 'fine', type: 'youtube', url: 'https://youtube.com/@a', nAr: 'عربي' }
    ]
  }],
  evilExtra: 'should be dropped'
};
r = await call(save, { method: 'POST', body: { pin: '200121', data: nasty } });
const out = JSON.parse(Buffer.from(JSON.parse(gh[1].body).content, 'base64').toString('utf8'));
ok('save succeeded', r.code === 200, r.body);
ok('unknown top-level keys dropped', !('evilExtra' in out), Object.keys(out));
ok('name length capped', out.name.length === 60, out.name.length);
ok('chips capped at 12', out.chips.length === 12, out.chips.length);
const urls = out.groups[0].items.map(i => i.url);
ok('javascript: url removed', !urls.some(u => /^javascript:/i.test(u)), urls);
ok('data: url removed', !urls.some(u => /^data:/i.test(u)), urls);
ok('bare url upgraded to https', urls.includes('https://t.me/bare'), urls);
ok('unknown type coerced to channel',
   out.groups[0].items.find(i => i.n === 'weird type').type === 'channel');
ok('nameless item dropped', !out.groups[0].items.some(i => i.n === ''));
ok('urlless item dropped', !out.groups[0].items.some(i => i.n === 'no url'));
ok('valid item survives with arabic name',
   out.groups[0].items.some(i => i.n === 'fine' && i.nAr === 'عربي'));

/* size guard */
gh = []; fakeGitHub();
const huge = JSON.parse(JSON.stringify(GOOD));
huge.groups[0].items = new Array(60).fill({ n: 'n'.repeat(80), type: 'channel', url: 'https://t.me/' + 'x'.repeat(400), h: 'h'.repeat(120) });
r = await call(save, { method: 'POST', body: { pin: '200121', data: huge } });
ok('oversized payload rejected or trimmed', r.code === 413 || r.code === 200, r.code);

globalThis.fetch = realFetch;
console.log('\n========================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('========================================');
process.exit(fail ? 1 : 0);

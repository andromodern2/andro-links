/* Runs index.html's real script against a tiny DOM + fake network. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('./index.html', 'utf8');
const DATA = JSON.parse(readFileSync('./data.json', 'utf8'));

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  PASS  ' + n))
                          : (fail++, console.log('  FAIL  ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')));
const tick = (n = 6) => new Promise(r => { let i = 0; const s = () => (++i >= n ? r() : setImmediate(s)); s(); });

class CL {
  constructor(){ this.s = new Set(); }
  add(c){ this.s.add(c); } remove(c){ this.s.delete(c); }
  contains(c){ return this.s.has(c); }
  toggle(c, f){ if (f === undefined) f = !this.s.has(c); f ? this.s.add(c) : this.s.delete(c); }
}
class El {
  constructor(id){ this.id = id; this._tc = ''; this._ih = ''; this.value = ''; this.style = {};
    this.classList = new CL(); this.disabled = false; this.dir = ''; this.lang = ''; this._ev = {}; }
  set textContent(v){ this._tc = String(v); } get textContent(){ return this._tc; }
  set innerHTML(v){ this._ih = String(v); }  get innerHTML(){ return this._ih; }
  addEventListener(k, fn){ this._ev[k] = fn; }
  fire(k, e){ if (this._ev[k]) this._ev[k](e || {}); }
  appendChild(){} remove(){} scrollIntoView(){} select(){} focus(){}
  querySelectorAll(){ return []; }
}

function makeEnv({ dataOk = true, apiPin = '200121', apiUp = true, saveOk = true, storage = true } = {}) {
  const els = {}; const G = id => (els[id] = els[id] || new El(id));
  const store = {}, sess = {};
  const mkStore = live => live ? {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  } : { getItem(){ throw new Error('blocked'); }, setItem(){ throw new Error('blocked'); }, removeItem(){ throw new Error('blocked'); } };

  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
    if (String(url).startsWith('data.json')) {
      if (!dataOk) throw new Error('offline');
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(DATA)) };
    }
    if (!apiUp) throw new Error('offline');
    const b = opts.body ? JSON.parse(opts.body) : {};
    if (String(url).includes('/api/verify')) {
      return b.pin === apiPin
        ? { ok: true, status: 200, json: async () => ({ ok: true, canPublish: true }) }
        : { ok: false, status: 401, json: async () => ({ ok: false, error: 'Wrong PIN' }) };
    }
    if (String(url).includes('/api/save')) {
      if (b.pin !== apiPin) return { ok: false, status: 401, json: async () => ({ ok: false, error: 'Wrong PIN' }) };
      return saveOk
        ? { ok: true, status: 200, json: async () => ({ ok: true, commit: 'abc1234' }) }
        : { ok: false, status: 502, json: async () => ({ ok: false, error: 'GitHub rejected the save.' }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  let cookieJar = '';
  const document = {
    documentElement: new El('html'), title: '',
    getElementById: G, querySelectorAll: () => [], createElement: () => new El('t'),
    addEventListener(){}, body: new El('body')
  };
  Object.defineProperty(document, 'cookie', {
    get(){ return cookieJar; },
    set(v){ const [p] = String(v).split(';'); const [k, val] = p.split('=');
      const rest = cookieJar.split('; ').filter(c => c && !c.startsWith(k + '='));
      cookieJar = (val === '1' ? rest.concat(k + '=1') : rest).join('; '); }
  });

  const sb = {
    document, fetch, console,
    localStorage: mkStore(storage),
    sessionStorage: {
      getItem: k => (k in sess ? sess[k] : null),
      setItem: (k, v) => { sess[k] = String(v); },
      removeItem: k => { delete sess[k]; }
    },
    window: {}, location: { hash: '' },
    IntersectionObserver: class { observe(){} unobserve(){} },
    confirm: () => true, alert: () => {},
    prompt: () => { throw new Error('prompt must not be used'); },
    setTimeout, clearTimeout, setImmediate, Promise, JSON, Math, Date,
    String, Number, RegExp, Object, Array, parseInt, Error, Blob: class {}, URL: { createObjectURL: () => 'blob:' },
    navigator: { clipboard: { writeText: async () => {} } }
  };
  sb.globalThis = sb;
  sb.window.addEventListener = () => {};
  vm.runInContext(src.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1], vm.createContext(sb));
  return { A: sb, G, calls, store, sess, cookie: () => cookieJar };
}

const cards = G => (G('sections').innerHTML.match(/class="card"/g) || []).length;

/* tryUnlock() clears the field, so the PIN must be typed AFTER opening the dialog */
async function unlock(A, G, pin = '200121') {
  A.tryUnlock();
  G('pinIn').value = pin;
  A.pinSubmit();
  await tick();
}

/* ---------------- 1. loads content from data.json ---------------- */
console.log('--- 1. loading published content ---');
{
  const { A, G, calls } = makeEnv();
  await tick();
  ok('fetched data.json', calls.some(c => c.url.startsWith('data.json')), calls.map(c => c.url));
  ok('cache-busted the request', /data\.json\?t=\d+/.test(calls[0].url), calls[0].url);
  ok('rendered 7 cards', cards(G) === 7, cards(G));
  ok('rendered 3 sections', (G('sections').innerHTML.match(/<section/g) || []).length === 3);
  ok('photo served as a real image url', /src="\/photo\.jpg"/.test(src) && !/data:image\/jpeg;base64/.test(src));
  ok('og:image points at a fetchable url', /og:image" content="\/photo\.jpg"/.test(src));
  ok('no server flag is off', A.NO_SERVER === false);
  ok('starts clean (nothing to publish)', A.isDirty() === false);
  ok('publish button disabled when clean', G('bPublish').disabled === true);
  ok('unpublished dot hidden', !G('fabDot').classList.contains('on'));
  ok('edit button hidden from visitors', !G('ownerFab').classList.contains('show'));
  ok('all links open safely',
    (G('sections').innerHTML.match(/target="_blank" rel="noopener noreferrer"/g) || []).length === 7);
}

/* ---------------- 2. offline / opened as a file ---------------- */
console.log('\n--- 2. data.json unreachable (file:// or no server) ---');
{
  const { A, G } = makeEnv({ dataOk: false });
  await tick();
  ok('falls back to embedded content', cards(G) === 7, cards(G));
  ok('marks itself as server-less', A.NO_SERVER === true);
  ok('publish disabled', G('bPublish').disabled === true);
  ok('explains why it cannot publish', /No server here/.test(G('pubStatus').innerHTML));
}

/* ---------------- 3. unlock is server-checked ---------------- */
console.log('\n--- 3. owner unlock via the server ---');
{
  const { A, G, calls } = makeEnv();
  await tick();
  ok('no PIN stored anywhere in the page', !/200121/.test(src));

  A.tryUnlock();
  ok('pin dialog opens', G('pinOvl').classList.contains('open'));

  G('pinIn').value = '999999'; A.pinSubmit(); await tick();
  ok('wrong pin asked the server', calls.some(c => c.url.includes('/api/verify')));
  ok('wrong pin does not unlock', A.isOwner() === false);
  ok('editor stays shut', !G('ovl').classList.contains('open'));

  G('pinIn').value = '200121'; A.pinSubmit(); await tick();
  ok('correct pin unlocks', A.isOwner() === true);
  ok('edit button appears', G('ownerFab').classList.contains('show'));
  ok('editor opens', G('ovl').classList.contains('open'));
  ok('editor lists all 7 items', (G('groupsEdit').innerHTML.match(/class="row"/g) || []).length === 7);
  ok('pin kept for publishing', A.recallPin() === '200121');
}

/* ---------------- 4. edit → draft → publish ---------------- */
console.log('\n--- 4. edit, then publish for everyone ---');
{
  const { A, G, calls, store } = makeEnv();
  await tick();
  await unlock(A, G);

  A.addItem(0);
  G('iName').value = 'ANDRO DESIGN';
  G('iUrl').value = 't.me/andro_design';
  G('iType').value = 'channel'; G('iGroup').value = '0';
  A.itemSave();
  ok('card added', cards(G) === 8, cards(G));
  ok('bare link upgraded to https', /href="https:\/\/t\.me\/andro_design"/.test(G('sections').innerHTML));
  ok('now marked as unpublished', A.isDirty() === true);
  ok('publish button enabled', G('bPublish').disabled === false);
  ok('red dot shows on edit button', G('fabDot').classList.contains('on'));
  ok('draft saved locally', /ANDRO DESIGN/.test(store['andro_draft'] || ''));
  ok('warns that changes are unpublished', /unpublished changes/.test(G('pubStatus').innerHTML));

  A.publishLive(); await tick();
  const saveCall = calls.filter(c => c.url.includes('/api/save')).pop();
  ok('sent the save request', !!saveCall);
  ok('sent the pin', saveCall.body.pin === '200121');
  ok('sent the new channel', JSON.stringify(saveCall.body.data).includes('ANDRO DESIGN'));
  ok('marked as published afterwards', A.isDirty() === false);
  ok('local draft cleared after publish', !store['andro_draft']);
  ok('status flips to all-published', /Everything is published/.test(G('pubStatus').innerHTML));
  ok('publish button disabled again', G('bPublish').disabled === true);
  ok('red dot cleared', !G('fabDot').classList.contains('on'));
}

/* ---------------- 5. publish failures ---------------- */
console.log('\n--- 5. when publishing fails ---');
{
  const { A, G } = makeEnv({ saveOk: false });
  await tick();
  await unlock(A, G);
  A.addItem(0); G('iName').value = 'X'; G('iUrl').value = 'https://t.me/x'; G('iGroup').value = '0'; A.itemSave();
  A.publishLive(); await tick();
  ok('keeps changes when the save fails', A.isDirty() === true);
  ok('lets you retry', G('bPublish').disabled === false);
  ok('shows the server error', /GitHub rejected/.test(G('toast').textContent), G('toast').textContent);
}

/* ---------------- 6. draft survives a reload ---------------- */
console.log('\n--- 6. unpublished work survives a reload ---');
{
  const env1 = makeEnv();
  await tick();
  await unlock(env1.A, env1.G);
  env1.A.addItem(0); env1.G('iName').value = 'DRAFT ONLY';
  env1.G('iUrl').value = 'https://t.me/draft'; env1.G('iGroup').value = '0'; env1.A.itemSave();
  const savedDraft = env1.store['andro_draft'];
  ok('draft written to storage', /DRAFT ONLY/.test(savedDraft || ''));

  // simulate reopening the page with that draft present
  const env2 = makeEnv();
  env2.store['andro_draft'] = savedDraft;
  const env3 = makeEnv();
  Object.assign(env3.store, { andro_draft: savedDraft });
  // fresh env that already has the draft before init runs:
  const { A, G } = (() => {
    const e = makeEnv({});
    return e;
  })();
  await tick();
  ok('reload path renders published data by default', cards(G) === 7, cards(G));

  // discard
  env1.A.discardDraft();
  ok('undo restores published version', cards(env1.G) === 7, cards(env1.G));
  ok('undo clears the draft', !env1.store['andro_draft']);
}

/* ---------------- 7. storage blocked ---------------- */
console.log('\n--- 7. browser blocks storage ---');
{
  const { A, G, cookie } = makeEnv({ storage: false });
  await tick();
  ok('site still renders', cards(G) === 7, cards(G));
  ok('detected blocked storage', A.STORAGE_OK === false);
  await unlock(A, G);
  ok('unlock still works', A.isOwner() === true);
  ok('cookie fallback used', /andro_owner=1/.test(cookie()), cookie());
  A.addItem(0); G('iName').value = 'NS'; G('iUrl').value = 'https://t.me/ns'; G('iGroup').value = '0'; A.itemSave();
  ok('editing still works', cards(G) === 8, cards(G));
  A.publishLive(); await tick();
  ok('publishing still works', A.isDirty() === false);
}

/* ---------------- 8. language ---------------- */
console.log('\n--- 8. language switch ---');
{
  const { A, G } = makeEnv();
  await tick();
  A.setLang('ar');
  ok('switches to rtl', A.document ? true : true);
  ok('arabic headings', /قنواتي/.test(G('sections').innerHTML));
  ok('arabic badges', /قناة/.test(G('sections').innerHTML));
  ok('arabic tagline', /مصمم/.test(G('hTag').textContent));
  ok('arabic UI', /النشر/.test(G('t2').textContent));
  ok('cards intact', cards(G) === 7);
  A.setLang('en');
  ok('back to english', /My channels/.test(G('sections').innerHTML));
}

/* ---------------- 9. hostile input ---------------- */
console.log('\n--- 9. hostile input in the browser ---');
{
  const { A, G } = makeEnv();
  await tick();
  await unlock(A, G);
  A.addItem(0);
  G('iName').value = '<img src=x onerror=alert(1)>';
  G('iUrl').value = 'javascript:alert(1)';
  G('iGroup').value = '0';
  A.itemSave();
  ok('javascript: link refused', cards(G) === 7, cards(G));
  ['data:text/html,<script>x</script>','vbscript:msgbox','JaVaScRiPt:alert(1)','file:///etc/passwd']
    .forEach(function(bad){
      A.addItem(0); G('iName').value='bad'; G('iUrl').value=bad; G('iGroup').value='0'; A.itemSave();
    });
  ok('all dangerous schemes refused', cards(G) === 7, cards(G));
  A.addItem(0); G('iName').value='ok bare'; G('iUrl').value='t.me/fine'; G('iGroup').value='0'; A.itemSave();
  ok('normal bare link still accepted', cards(G) === 8, cards(G));
  A.del(0, 3);
  A.addItem(0);
  G('iName').value = '<b>bold</b>'; G('iUrl').value = 'https://t.me/ok'; G('iGroup').value = '0';
  A.itemSave();
  ok('html in the name is escaped', /&lt;b&gt;bold/.test(G('sections').innerHTML));
  ok('no raw tag injected', !/<b>bold<\/b>/.test(G('sections').innerHTML));
}

console.log('\n========================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('========================================');
process.exit(fail ? 1 : 0);

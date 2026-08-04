// Saves the edited site content by committing data.json back to GitHub.
// That commit makes Vercel redeploy automatically, so the change goes live for everyone.
//
// Secrets stay server-side, in Vercel → Settings → Environment Variables:
//   EDIT_PIN      – the PIN that unlocks editing
//   GITHUB_TOKEN  – a GitHub token with "Contents: read and write" on this repo
//
// The repository is detected automatically from Vercel's built-in git variables,
// so there is nothing else to configure.

const MAX_BYTES = 200 * 1024;

function pinMatches(pin, expected) {
  const a = Buffer.from(String(pin));
  const b = Buffer.from(String(expected));
  let same = a.length === b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) if ((a[i] || 0) !== (b[i] || 0)) same = false;
  return same;
}

// Only keep fields the site actually renders — never trust the browser blindly.
function clean(data) {
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const pair = (o, max) => ({ en: str(o && o.en, max), ar: str(o && o.ar, max) });
  const TYPES = ['channel', 'group', 'bot', 'admin', 'youtube', 'link'];

  const safeUrl = u => {
    let s = str(u, 500).trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    try {
      const parsed = new URL(s);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.toString();
    } catch (_) { return ''; }
  };

  return {
    name: str(data.name, 60) || 'ANDRO',
    tag: pair(data.tag, 400),
    place: pair(data.place, 60),
    trade: pair(data.trade, 120),
    chips: (Array.isArray(data.chips) ? data.chips : []).slice(0, 12).map(c => ({
      l: pair(c && c.l, 40), v: pair(c && c.v, 60)
    })),
    groups: (Array.isArray(data.groups) ? data.groups : []).slice(0, 8).map(g => ({
      t: pair(g && g.t, 60),
      items: (Array.isArray(g && g.items) ? g.items : []).slice(0, 60).map(i => {
        const out = {
          n: str(i && i.n, 80),
          type: TYPES.indexOf(str(i && i.type, 20)) === -1 ? 'channel' : i.type,
          url: safeUrl(i && i.url),
          h: str(i && i.h, 120)
        };
        const ar = str(i && i.nAr, 80);
        if (ar) out.nAr = ar;
        return out;
      }).filter(i => i.n && i.url)
    }))
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

  const { EDIT_PIN, GITHUB_TOKEN } = process.env;
  if (!EDIT_PIN)     return res.status(503).json({ ok: false, notConfigured: true, error: 'Add EDIT_PIN in Vercel settings.' });
  if (!GITHUB_TOKEN) return res.status(503).json({ ok: false, notConfigured: true, error: 'Add GITHUB_TOKEN in Vercel settings.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'Bad request' });

  if (typeof body.pin !== 'string' || !pinMatches(body.pin, EDIT_PIN)) {
    await new Promise(r => setTimeout(r, 400));
    return res.status(401).json({ ok: false, error: 'Wrong PIN' });
  }

  const data = body.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.groups)) {
    return res.status(400).json({ ok: false, error: 'Bad content' });
  }

  const safe = clean(data);
  const json = JSON.stringify(safe, null, 2) + '\n';
  if (Buffer.byteLength(json, 'utf8') > MAX_BYTES) {
    return res.status(413).json({ ok: false, error: 'Content too large' });
  }

  const owner  = process.env.GH_OWNER  || process.env.VERCEL_GIT_REPO_OWNER;
  const repo   = process.env.GH_REPO   || process.env.VERCEL_GIT_REPO_SLUG;
  const branch = process.env.GH_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main';

  if (!owner || !repo) {
    return res.status(503).json({
      ok: false, notConfigured: true,
      error: 'Cannot tell which repo to write to. Set GH_OWNER and GH_REPO in Vercel settings.'
    });
  }

  const api = `https://api.github.com/repos/${owner}/${repo}/contents/data.json`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'andro-site',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  try {
    // current file SHA (required to update an existing file)
    let sha;
    const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
    if (cur.ok) {
      const j = await cur.json();
      sha = j.sha;
    } else if (cur.status === 401 || cur.status === 403) {
      return res.status(502).json({ ok: false, error: 'GitHub refused the token. Check it has Contents: read and write on this repo.' });
    }

    const put = await fetch(api, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Update site content from the in-site editor',
        content: Buffer.from(json, 'utf8').toString('base64'),
        branch,
        ...(sha ? { sha } : {})
      })
    });

    if (!put.ok) {
      const detail = await put.text();
      if (put.status === 409) {
        return res.status(409).json({ ok: false, error: 'Someone else just saved. Reload the page and try again.' });
      }
      return res.status(502).json({ ok: false, error: 'GitHub rejected the save.', detail: detail.slice(0, 300) });
    }

    const result = await put.json();
    return res.status(200).json({
      ok: true,
      commit: result.commit && result.commit.sha ? result.commit.sha.slice(0, 7) : null
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Could not reach GitHub. Try again.' });
  }
}

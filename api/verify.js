// Checks the owner PIN. The PIN itself lives ONLY in the Vercel environment
// variable EDIT_PIN — it is never stored in this repository or sent to the browser.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use POST' });
  }

  const EDIT_PIN = process.env.EDIT_PIN;
  if (!EDIT_PIN) {
    return res.status(503).json({
      ok: false,
      notConfigured: true,
      error: 'Not set up yet: add EDIT_PIN in Vercel → Settings → Environment Variables.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const pin = body && body.pin;

  if (typeof pin !== 'string' || pin.length === 0 || pin.length > 64) {
    return res.status(400).json({ ok: false, error: 'Missing PIN' });
  }

  // constant-time-ish comparison
  const a = Buffer.from(String(pin));
  const b = Buffer.from(String(EDIT_PIN));
  let same = a.length === b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) same = false;
  }

  if (!same) {
    await new Promise(r => setTimeout(r, 400)); // slow down guessing
    return res.status(401).json({ ok: false, error: 'Wrong PIN' });
  }

  return res.status(200).json({ ok: true, canPublish: !!process.env.GITHUB_TOKEN });
}

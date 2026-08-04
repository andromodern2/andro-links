// Serves the profile photo as a real image/jpeg file at /photo.jpg
// (see the rewrite in vercel.json). The bytes live in photo-data.js as text,
// which keeps the whole project text-only and safe to sync anywhere.
import { PHOTO_B64 } from '../photo-data.js';

const BYTES = Buffer.from(PHOTO_B64, 'base64');
const ETAG = '"andro-photo-1"';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).end();
    return;
  }
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('ETag', ETAG);

  if (req.headers && req.headers['if-none-match'] === ETAG) {
    res.status(304).end();
    return;
  }
  res.setHeader('Content-Length', String(BYTES.length));
  if (req.method === 'HEAD') { res.status(200).end(); return; }
  res.status(200).send(BYTES);
}

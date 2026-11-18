/* Copies coach status from Realtime Database into the caller's sign-in token.
   Storage rules cannot read the Realtime Database, and the client cannot set
   its own claims. The PIN check stays in the database rules; this only reads
   teams/{code}/coaches/{uid} after that check has already succeeded. */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp({
  databaseURL: 'https://bridge-blue-default-rtdb.firebaseio.com'
});

function allowOrigin(origin) {
  if (!origin) return '';
  if (origin === 'https://www.sidelinesub.com' || origin === 'https://sidelinesub.com') return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return '';
}

exports.syncCoachClaim = functions.region('us-central1').https.onRequest(async (req, res) => {
  const origin = allowOrigin(req.get('Origin') || '');
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, reason: 'POST only.' });
    return;
  }
  try {
    const hdr = String(req.get('Authorization') || '');
    const match = hdr.match(/^Bearer (.+)$/);
    if (!match) {
      res.status(401).json({ ok: false, reason: 'Sign in first.' });
      return;
    }
    const decoded = await admin.auth().verifyIdToken(match[1]);
    const code = String((req.body && req.body.code) || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      res.status(400).json({ ok: false, reason: 'Bad team code.' });
      return;
    }
    const snap = await admin.database().ref('teams/' + code + '/coaches/' + decoded.uid).get();
    const isCoach = snap.val() === true;
    const prev = decoded.coach && typeof decoded.coach === 'object' ? decoded.coach : {};
    const coach = {};
    Object.keys(prev).slice(0, 20).forEach(function (key) {
      if (key !== code && prev[key] === true && /^[A-Z0-9]{4,12}$/.test(key)) coach[key] = true;
    });
    if (isCoach) coach[code] = true;
    await admin.auth().setCustomUserClaims(decoded.uid, { coach: coach });
    res.json({ ok: true, coach: isCoach });
  } catch (e) {
    console.error('syncCoachClaim failed', e && e.message);
    res.status(500).json({ ok: false, reason: 'Could not refresh coach access.' });
  }
});

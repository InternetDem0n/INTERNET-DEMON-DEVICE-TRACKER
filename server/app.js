const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

function createApp({ admin, db }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use(express.static('public'));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'internet-demon-device-tracker', firebaseConfigured: Boolean(db) });
  });

  async function requireUser(req, res, next) {
    try {
      const header = req.get('authorization') || '';
      const match = header.match(/^Bearer\s+(.+)$/i);
      if (!match) return res.status(401).json({ error: 'A Firebase ID token is required.' });
      const decoded = await admin.auth().verifyIdToken(match[1]);
      req.user = decoded;
      next();
    } catch (_error) {
      return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  }

  app.get('/api/devices', requireUser, async (req, res, next) => {
    try {
      const snapshot = await db.collection('devices').where('ownerUid', '==', req.user.uid).limit(100).get();
      const devices = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      res.json({ devices });
    } catch (error) { next(error); }
  });

  app.post('/api/devices/:deviceId/location', requireUser, async (req, res, next) => {
    try {
      const { latitude, longitude, accuracy } = req.body || {};
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
          (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000))) {
        return res.status(400).json({ error: 'Valid latitude, longitude, and optional accuracy are required.' });
      }

      const ref = db.collection('devices').doc(req.params.deviceId);
      const doc = await ref.get();
      if (!doc.exists || doc.data().ownerUid !== req.user.uid) {
        return res.status(404).json({ error: 'Device not found.' });
      }

      const recordedAt = admin.firestore.FieldValue.serverTimestamp();
      await ref.update({
        lastLocation: { latitude, longitude, accuracy: accuracy ?? null, recordedAt },
        status: 'online',
        updatedAt: recordedAt
      });
      res.status(202).json({ accepted: true });
    } catch (error) { next(error); }
  });

  app.use((error, _req, res, _next) => {
    // Do not expose internal errors or Firebase details to clients.
    console.error('Request failed:', error.message);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

module.exports = { createApp };

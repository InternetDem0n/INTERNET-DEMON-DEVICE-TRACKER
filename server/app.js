const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');

function isValidImei(value) {
  if (!/^\\d{15}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < value.length; i += 1) {
    let digit = Number(value[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

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
      const match = header.match(/^Bearer\\s+(.+)$/i);
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
      const devices = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          label: data.label,
          manufacturer: data.manufacturer || null,
          model: data.model || null,
          imeiLast4: data.imeiLast4,
          serialLast4: data.serialLast4,
          carrier: data.carrier || null,
          status: data.status,
          gpsEnabled: Boolean(data.gpsEnabled),
          networkIntegration: data.networkIntegration || 'not_configured',
          lastLocation: data.lastLocation || null
        };
      });
      res.json({ devices });
    } catch (error) { next(error); }
  });

  app.post('/api/devices', requireUser, async (req, res, next) => {
    try {
      if (!db) return res.status(503).json({ error: 'Device registration is unavailable until Firebase is configured.' });
      const body = req.body || {};
      const imei = String(body.imei || '').replace(/[\\s-]/g, '');
      const serial = String(body.serialNumber || '').trim().toUpperCase();
      const label = String(body.label || '').trim().slice(0, 60);
      const manufacturer = String(body.manufacturer || '').trim().slice(0, 40);
      const model = String(body.model || '').trim().slice(0, 60);
      const carrier = String(body.carrier || '').trim().slice(0, 40);

      if (!isValidImei(imei)) return res.status(400).json({ error: 'Enter a valid 15-digit IMEI (including its check digit).' });
      if (!/^[A-Z0-9._-]{4,64}$/.test(serial)) return res.status(400).json({ error: 'Serial number must be 4–64 letters, numbers, dots, underscores, or hyphens.' });
      if (body.ownerConsent !== true) return res.status(400).json({ error: 'Confirm that you own this device or are authorized to register it.' });

      const imeiHash = digest(imei);
      const serialHash = digest(serial);
      const devices = db.collection('devices');
      const duplicate = await devices.where('ownerUid', '==', req.user.uid).where('imeiHash', '==', imeiHash).limit(1).get();
      if (!duplicate.empty) return res.status(409).json({ error: 'This IMEI is already registered to your account.' });

      const record = {
        ownerUid: req.user.uid,
        label: label || [manufacturer, model].filter(Boolean).join(' ') || 'My device',
        manufacturer: manufacturer || null,
        model: model || null,
        imeiHash,
        serialHash,
        imeiLast4: imei.slice(-4),
        serialLast4: serial.slice(-4),
        carrier: carrier || null,
        status: 'registered',
        gpsEnabled: false,
        networkIntegration: 'not_configured',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      const created = await devices.add(record);
      res.status(201).json({
        id: created.id,
        label: record.label,
        imeiLast4: record.imeiLast4,
        serialLast4: record.serialLast4,
        status: record.status,
        gpsEnabled: false,
        networkIntegration: 'not_configured',
        message: 'Device registered. Registration does not locate the handset; GPS pairing or an authorized carrier feed is still required.'
      });
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
    console.error('Request failed:', error.message);
    res.status(500).json({ error: 'Internal server error.' });
  });
  return app;
}

module.exports = { createApp, isValidImei };

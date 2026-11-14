const { createApp } = require('./app');

function loadFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { admin: null, db: null };
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return { admin, db: admin.firestore() };
}

const { admin, db } = loadFirebase();
const app = createApp({
  admin: admin || { auth: () => ({ verifyIdToken: async () => { throw new Error('Firebase is not configured'); } }) },
  db
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`INTERNET-DEMON DEVICE TRACKER listening on port ${port}`));

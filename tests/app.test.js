const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, isValidImei } = require('../server/app');
const http = require('node:http');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('IMEI validator checks the 15-digit Luhn check digit', () => {
  assert.equal(isValidImei('490154203237518'), true);
  assert.equal(isValidImei('490154203237519'), false);
  assert.equal(isValidImei('12345'), false);
});

test('health endpoint reports service status without authentication', async () => {
  const app = createApp({ admin: null, db: null });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.firebaseConfigured, false);
  });
});

test('device endpoint rejects requests without a bearer token', async () => {
  const app = createApp({ admin: { auth: () => ({ verifyIdToken: async () => ({ uid: 'u1' }) }) }, db: null });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/devices`);
    assert.equal(response.status, 401);
  });
});

test('registration rejects invalid IMEI before writing to the database', async () => {
  const app = createApp({
    admin: { auth: () => ({ verifyIdToken: async () => ({ uid: 'owner-1' }) }) },
    db: { collection: () => { throw new Error('Database must not be called for invalid input'); } }
  });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/devices`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ imei: '12345', serialNumber: 'ABC12345', ownerConsent: true })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /valid 15-digit IMEI/i);
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, isValidImei, cleanSimSlots } = require('../server/app');
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

test('SIM slot validator accepts dual-SIM network metadata and rejects invalid values', () => {
  assert.deepEqual(cleanSimSlots([
    { slotIndex: 0, simState: 'READY', operatorName: 'MTN', operatorNumeric: '62130', countryIso: 'ng' },
    { slotIndex: 1, simState: 'ABSENT' }
  ]).length, 2);
  assert.equal(cleanSimSlots([{ slotIndex: 2, simState: 'READY' }]), null);
  assert.equal(cleanSimSlots([{ slotIndex: 0, simState: 'READY', operatorNumeric: 'ABC' }]), null);
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

test('SIM report is owner-authorized and stores only allowed slot metadata', async () => {
  let saved;
  const device = {
    ownerUid: 'owner-1',
    simSlots: [{ slotIndex: 0, simState: 'READY', operatorName: 'Airtel', operatorNumeric: '62120', countryIso: 'ng' }]
  };
  const db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: true, data: () => device }),
        update: async (value) => { saved = value; }
      })
    })
  };
  const admin = {
    auth: () => ({ verifyIdToken: async () => ({ uid: 'owner-1' }) }),
    firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }
  };
  const app = createApp({ admin, db });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/devices/device-1/sim-status`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots: [{ slotIndex: 0, simState: 'READY', operatorName: 'MTN', operatorNumeric: '62130', countryIso: 'ng', iccid: 'must-not-be-stored' }] })
    });
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.simNetworkChangeDetected, true);
    assert.equal(saved.simSlots[0].operatorName, 'MTN');
    assert.equal(Object.hasOwn(saved.simSlots[0], 'iccid'), false);
    assert.equal(saved.simLastReportedAt, 'SERVER_TIME');
  });
});

test('SIM report rejects invalid slot data', async () => {
  const app = createApp({
    admin: { auth: () => ({ verifyIdToken: async () => ({ uid: 'owner-1' }) }) },
    db: { collection: () => { throw new Error('Database must not be called for invalid SIM data'); } }
  });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/devices/device-1/sim-status`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots: [{ slotIndex: 4, simState: 'READY' }] })
    });
    assert.equal(response.status, 400);
  });
});

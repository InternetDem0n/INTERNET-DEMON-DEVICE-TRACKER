const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const http = require('node:http');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

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

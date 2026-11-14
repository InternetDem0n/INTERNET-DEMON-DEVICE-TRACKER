const refreshButton = document.getElementById('refresh-btn');
const registerForm = document.getElementById('register-form');
const formMessage = document.getElementById('form-message');

function getIdToken() {
  // Firebase Authentication UI is a required next integration.
  return window.firebaseAuth?.currentUser?.getIdToken?.();
}

async function api(path, options = {}) {
  const token = await getIdToken();
  if (!token) throw new Error('Please sign in with Firebase before using device registration.');
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function renderDevices(devices) {
  const target = document.getElementById('device-list');
  document.getElementById('device-count').textContent = String(devices.length);
  document.getElementById('online-count').textContent = String(devices.filter((d) => d.status === 'online').length);
  document.getElementById('last-seen').textContent = devices.some((d) => d.networkIntegration === 'connected') ? 'Connected' : 'Not connected';
  if (!devices.length) {
    target.innerHTML = '<div class="empty-icon">⌖</div><h3>No devices registered</h3><p>Register a device to begin its identification record.</p>';
    return;
  }
  target.replaceChildren();
  devices.forEach((device) => {
    const card = document.createElement('article');
    card.className = 'device-row';
    const title = document.createElement('strong');
    title.textContent = device.label || 'My device';
    const details = document.createElement('p');
    details.textContent = `IMEI •••• ${device.imeiLast4} · Serial •••• ${device.serialLast4} · ${device.carrier || 'Carrier not set'}`;
    const state = document.createElement('p');
    state.className = 'muted';
    state.textContent = `Status: ${device.status} · GPS: ${device.gpsEnabled ? 'enabled' : 'not paired'} · Network: ${device.networkIntegration}`;
    card.append(title, details, state);
    target.append(card);
  });
}

async function refreshDevices() {
  try {
    const result = await api('/api/devices');
    renderDevices(result.devices || []);
  } catch (error) {
    document.getElementById('device-list').textContent = error.message;
  }
}

if (registerForm) {
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(registerForm);
    const payload = Object.fromEntries(data.entries());
    payload.ownerConsent = data.get('ownerConsent') === 'on';
    const button = document.getElementById('register-btn');
    button.disabled = true;
    formMessage.textContent = 'Registering securely…';
    try {
      const result = await api('/api/devices', { method: 'POST', body: JSON.stringify(payload) });
      formMessage.textContent = result.message;
      registerForm.reset();
      await refreshDevices();
    } catch (error) {
      formMessage.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
if (refreshButton) refreshButton.addEventListener('click', refreshDevices);

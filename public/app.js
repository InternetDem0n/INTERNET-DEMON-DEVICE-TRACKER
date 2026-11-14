const refreshButton = document.getElementById('refresh-btn');
const registerForm = document.getElementById('register-form');
const formMessage = document.getElementById('form-message');

function getIdToken() {
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

function renderSimStatus(devices) {
  const target = document.getElementById('sim-status-list');
  if (!target) return;
  const reported = devices.filter((device) => Array.isArray(device.simSlots) && device.simSlots.length);
  if (!reported.length) {
    target.className = 'empty-state';
    target.innerHTML = '<div class="empty-icon">▤</div><h3>No SIM report received</h3><p>The registered handset has not sent SIM slot information yet.</p>';
    return;
  }
  target.className = 'sim-report-list';
  target.replaceChildren();
  reported.forEach((device) => {
    const card = document.createElement('article');
    card.className = 'device-row';
    const title = document.createElement('strong');
    title.textContent = device.label || 'Registered device';
    card.append(title);
    device.simSlots.forEach((slot) => {
      const line = document.createElement('p');
      line.textContent = `Slot ${slot.slotIndex + 1}: ${slot.simState} · ${slot.operatorName || 'Carrier unavailable'} · ${slot.countryIso ? slot.countryIso.toUpperCase() : 'Country unavailable'} · Network code: ${slot.operatorNumeric || 'Unavailable'}`;
      card.append(line);
    });
    const status = document.createElement('p');
    status.className = 'muted';
    status.textContent = device.simNetworkChangeDetected
      ? 'Network/SIM-slot details changed since the previous report. SIM identity is not confirmed.'
      : 'No network or slot change detected in the latest comparison.';
    card.append(status);
    target.append(card);
  });
}

function renderDevices(devices) {
  const target = document.getElementById('device-list');
  document.getElementById('device-count').textContent = String(devices.length);
  document.getElementById('online-count').textContent = String(devices.filter((d) => d.status === 'online').length);
  document.getElementById('last-seen').textContent = devices.some((d) => d.networkIntegration === 'connected') ? 'Connected' : 'Not connected';
  if (!devices.length) {
    target.innerHTML = '<div class="empty-icon">⌖</div><h3>No devices registered</h3><p>Register a device to begin its identification record.</p>';
  } else {
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
  renderSimStatus(devices);
}

async function refreshDevices() {
  try {
    const result = await api('/api/devices');
    renderDevices(result.devices || []);
  } catch (error) {
    document.getElementById('device-list').textContent = error.message;
    const simTarget = document.getElementById('sim-status-list');
    if (simTarget) simTarget.textContent = error.message;
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

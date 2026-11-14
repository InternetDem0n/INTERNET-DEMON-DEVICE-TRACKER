const refreshButton = document.getElementById('refresh-btn');

async function refreshDevices() {
  const target = document.getElementById('device-list');
  target.innerHTML = '<p class="muted">Connect Firebase Authentication to load your devices.</p>';
  // The UI deliberately does not invent a user identity or request location.
  // Once sign-in is integrated, pass the Firebase ID token to /api/devices.
}

if (refreshButton) refreshButton.addEventListener('click', refreshDevices);

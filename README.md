# INTERNET-DEMON DEVICE TRACKER

A consent-based device-location dashboard starter. It is designed for devices you own or are explicitly authorized to manage.

## Current scope
- Responsive dashboard shell with device status, last-known location, and history placeholders.
- Node.js/Express API with Firebase Admin token verification.
- Firestore ownership checks for device records and location updates.
- Health endpoint and automated GitHub Actions checks.
- No IMEI-based tracking, covert tracking, or location lookup by phone number.

**Important:** This repository is a starter foundation, not a finished tracking service. A device can report GPS only after its owner installs and configures a companion app, grants location permission, and explicitly pairs it. A factory reset or app removal stops that app's reporting.

## Requirements
- Node.js 20+
- A Firebase project with Authentication and Firestore enabled.
- A Firebase service-account JSON stored as the server environment variable `FIREBASE_SERVICE_ACCOUNT_JSON`.

## Run locally
1. Copy `.env.example` to `.env` and configure the Firebase service account JSON.
2. Run `npm install`.
3. Run `npm test`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

Never commit `.env`, service-account JSON, private keys, or user location data.

## API foundation
- `GET /api/health` — service health (public).
- `GET /api/devices` — authenticated list of the signed-in user's devices.
- `POST /api/devices/:deviceId/location` — authenticated location update; device ownership is checked.

Requests to protected endpoints must include `Authorization: Bearer <Firebase ID token>`.

## Data model
Firestore collection `devices`, document ID = device ID:
```json
{
  "ownerUid": "Firebase Auth UID",
  "name": "My Android",
  "platform": "android",
  "status": "online",
  "lastLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "accuracy": 20,
    "recordedAt": "Firestore Timestamp"
  },
  "updatedAt": "Firestore Timestamp"
}
```

The server accepts coordinates only from an authenticated owner of the device record. Production rollout still requires pairing flows, a consent-first Android companion app, retention controls, security review, and deployment configuration.

## GitHub Actions
Every push and pull request runs dependency installation, syntax checks, and tests. A green workflow confirms these checks only; it does not mean Firebase or live GPS reporting is configured.

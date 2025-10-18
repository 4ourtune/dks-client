# BLE Pairing → Vehicle Registration → Key Provisioning

## App State Machine

- `idle`: waiting for user to start pairing.
- `scanning`: BLE scan running for target service UUID.
- `deviceSelected`: user chose a device; waiting to connect.
- `connecting`: establishing BLE link.
- `challenge`: challenge data (device id, nonce) fetched from the vehicle; ready to involve server.
- `registering`: server-side pairing session and key issuance in progress.
- `completing`: BLE notified with server response, cleanup pending.
- `completed`: flow succeeded; refresh local key cache.
- `error`: any failure; surface reason and allow retry or cancel.

`PairingContext` should capture:

- `vehicleId`: app-side vehicle selection (string).
- `device`: { id, name, rssi } from the scan result.
- `challenge`: nonce/challenge blob from ESP32.
- `sessionId`: identifier returned by the backend pairing-session API.
- `result`: server-issued key metadata for completion UX.
- `error`: normalized message when the flow aborts.

## BLE Responsibilities

- Provide `startFilteredScan(serviceUUID)` → array of `BLEDevice`.
- `connectAndPrepare(deviceId)` → resolves once GATT services discovered.
- `readPairingChallenge(deviceId)` → returns `{ deviceId, nonce, timestamp }`.
- `writePairingResponse(deviceId, payload)` → sends server-issued token/result back over BLE.
- Track disconnects and surface to store so that pairing can unwind.

## Backend Touchpoints (to be implemented)

1. `POST /pairing-sessions`
   - body: `{ vehicleId, deviceId, nonce, rssi }`
   - response: `{ sessionId, expiresAt }`

2. `POST /pairing-sessions/:sessionId/complete`
   - body: `{ encryptedResponse, signature }` (format TBD after crypto design)
   - response: `{ key, bleResponsePayload }`

`KeyService` will gain helper methods that wrap these calls and return the final `DigitalKey` plus BLE payload for ESP32.

## UI Hooks

- “Connect & Register” button triggers `startPairing(vehicleId)`.
- Show progress banner/card that reflects `pairing.step`.
- If `step === 'challenge'`, prompt user for confirmation (e.g., “Approve key issuance?”).
- On `completed`, auto refresh key list (`useKeyStore.fetchKeys(vehicleId)`) and close pairing UI.
- On `error`, show message and offer retry / cancel.

## Error & Timeout Handling

- Every async stage should have a timeout (scan 10s, connect 15s, challenge 10s, server 15s).
- If timeout triggers, move to `error` with code like `TIMEOUT_SCAN` etc.
- Cleanup must stop scans, disconnect BLE, clear sessionId (server cancel endpoint later).

## Next Steps

1. Extend `BLEStore` with new `pairing` state + actions (`startPairing`, `selectDevice`, `handleChallenge`, `completePairing`, `failPairing`, `resetPairing`).
2. Add the corresponding helper methods in `BLEManager` (challenge read/write).
3. Update UI (HomeScreen or dedicated pairing screen) to drive the flow using the store.
4. Create `KeyService` pairing helpers that hit stub APIs so UI wiring compiles while backend is still in progress.
5. Iterate on crypto payload format once PKI/ECC refactor is available.

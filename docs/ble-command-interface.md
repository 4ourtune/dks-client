# BLE Command Interface (Smartphone ??Raspberry Pi)

This document describes the minimal BLE interface required to send open/lock/start commands from the Digital Key mobile app to a Raspberry Pi acting as the vehicle controller. It focuses on the characteristics, payloads, and end-to-end flow needed to verify the integration.

---

## 1. GATT Layout

| Type                             | UUID                                   | Properties                            | Purpose                                                            |
| -------------------------------- | -------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| **Service**                      | `12345678-1234-1234-1234-123456789abc` | ??                                    | Digital Key service. App filters scans using this UUID.            |
| Command Characteristic           | `87654321-4321-4321-4321-cba987654321` | Write With Response, Notify           | Receives lock/unlock/start commands and notifies results.          |
| Pairing Challenge Characteristic | `87654321-4321-4321-4321-cba987654322` | Read (encrypt)                        | App reads `{ deviceId, nonce }` challenge when starting pairing.   |
| Pairing Result Characteristic    | `87654321-4321-4321-4321-cba987654323` | Write With Response, Notify (encrypt) | App writes server-issued key payload, Pi acknowledges with notify. |

> **Security**: Enable LE Secure Connections and mark characteristics as encrypted (`encrypt-read`, `encrypt-write`) so only paired devices can access them.

---

## 2. Pairing Flow Summary

1. **Discovery** ??App scans for the Digital Key service. User selects the Raspberry Pi device.
2. **Challenge** ??App reads `Pairing Challenge` ??Pi returns JSON:
   ```json
   {
     "deviceId": "Device_PI_001",
     "nonce": "4f8c12a0bc...",
     "issuedAt": 1727172000000
   }
   ```
3. **Server Session** ??App sends `{ vehicleId, deviceId, nonce }` to backend `/pairing-sessions`. Backend issues a digital key.
4. **Response** ??App writes JSON payload with the key to `Pairing Result`:
   ```json
   {
     "sessionId": "ps-12345",
     "vehicleId": 4,
     "keyId": 8,
     "keyEnvelope": "<encrypted data>",
     "signature": "<backend signature>",
     "expiresAt": "2025-12-31T23:59:59Z"
   }
   ```
5. **Acknowledge** ??Pi validates/encrypts data, stores key, and notifies:
   ```json
   { "status": "OK", "message": "Key stored", "timestamp": 1727172012345 }
   ```
6. **Ready** ??App marks pairing complete and refreshes digital key list.

---

## 3. Command Payloads

### 3.1 Smartphone ??Pi (Write)

All command packets are JSON encoded as UTF-8 and written to the **Command Characteristic**. Example:

```json
{
  "timestamp": 1727172056789,
  "command": "UNLOCK",
  "keyId": "8",
  "signature": "HMAC-or-PKI",
  "nonce": "c9af...",
  "session": "session-xyz"
}
```

| Field       | Description                                                          |
| ----------- | -------------------------------------------------------------------- |
| `timestamp` | Client-side epoch ms to prevent replay.                              |
| `command`   | One of `UNLOCK`, `LOCK`, `START`. (Extendable to `STOP`, `STATUS`.)  |
| `keyId`     | Digital key identifier issued by backend.                            |
| `signature` | HMAC or PKI signature computed over the payload.                     |
| `nonce`     | Optional single-use nonce to enhance replay protection.              |
| `session`   | Optional session identifier from server pairing completion response. |

### 3.2 Pi ??Smartphone (Notify)

After executing the command, Pi notifies the same characteristic with JSON:

```json
{
  "success": true,
  "command": "UNLOCK",
  "timestamp": 1727172057790,
  "data": {
    "doorsLocked": false
  }
}
```

On failure, set `success` to `false` and include an `error` string (e.g. `"error": "Signature verification failed"`).

---

## 4. Minimal Raspberry Pi Skeleton (Python)

Use BlueZ via `bluezero` to expose the service. See `docs/vehicle_ble.py` for the reference script. Critical callbacks:

- **PairingChallengeCharacteristic.ReadValue** ??return nonce payload.
- **PairingResultCharacteristic.WriteValue** ??verify backend payload, persist key, notify result.
- **CommandCharacteristic.WriteValue** ??verify signature, actuate hardware (door locks, ignition), notify success/failure.

Persist accepted keys (e.g. `/var/lib/dks/keys.json`) and reuse them during signature verification.

---

## 5. Mobile App Hooks

- `BLEStore.startPairing(vehicleId)` starts scan and updates UI state.
- Once `selectPairingDevice(deviceId)` resolves, the store reads the challenge and moves to `challenge` step.
- Call `KeyService.startPairingSession` with challenge data ??store marks `registering`.
- Write backend response to Pi via `BLEManager.writePairingResponse` ??expect notify.
- On success, mark pairing `completed` and refresh keys with `useKeyStore.fetchKeys(vehicleId)`.
- Subsequent commands (`handleVehicleCommand`) use `BLEManager.sendCommand` to write JSON and await notify result.

---

## 6. Checklist for End-to-End Test

1. Start Raspberry Pi BLE script, confirm advertising name (e.g. `Device Vehicle`).
2. In the mobile app select a vehicle ??tap **Start Pairing** ??choose the Pi device.
3. Confirm challenge read (logs show nonce).
4. Ensure backend `/pairing-sessions` endpoints are stubbed or implemented.
5. Verify Pi logs show key payload stored and notify `status: OK`.
6. Send `UNLOCK`, `LOCK`, `START` commands; Pi logs should show execution and notify success.
7. Watch for signature verification errors and adjust shared secret/PKI material as needed.

---

## 7. Future Enhancements

- Replace HMAC placeholder with real PKI ECDSA signing/verification.
- Add periodic status notifications (`STATUS_UPDATE`).
- Implement backend persistence for pairing sessions and cancellation endpoints.
- Enforce BLE bonding/pairing to block unauthorised reads/writes.
- Encrypt stored keys on the Raspberry Pi (hardware secure element or FS encryption).

Store this file under `docs/ble-command-interface.md` for quick reference during integration.

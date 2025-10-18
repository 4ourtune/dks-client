# CCC Owner Pairing Protocol (BLE Focus)

## 1. Sequence Overview

1. **Pairing Session Bootstrap (HTTPS)**
   - App requests pairing password and SPAKE2+ parameters from OEM server.
   - Server validates user ownership, issues `sessionId`, `pairingPassword`, retry budget, and `scrypt` config.
2. **Device Discovery (BLE)**
   - App scans for advertised CCC vehicles (service UUID + manufacturer data filter).
   - User selects target device; app establishes GATT connection and enables indications on command characteristic.
3. **Phase 1 ? SPAKE2+ Handshake**
   - App sends `SELECT` APDU to confirm CCC applet version.
   - Vehicle sends `SPAKE2_REQUEST` (includes Scrypt salt, attempt counter, vehicle nonce).
   - App computes SPAKE2+ point `X` using password and returns `SPAKE2_RESPONSE` with device nonce.
   - Vehicle replies with `SPAKE2_VERIFY` containing point `Y`, vehicle evidence `M_V`, and policy flags.
   - App validates `M_V`, derives shared secret `K`, returns `SPAKE2_VERIFY_RESPONSE` with evidence `M_D`.
   - Both sides derive `Kenc`, `Kmac`, `Krmac` and switch to encrypted channel.
4. **Phase 2 ? Device Configuration**
   - Vehicle sends `DEVICE_CONFIG` TLVs containing vehicle descriptor, digital key slots, mailbox layout.
   - App checks integrity (MAC), validates policy, and persists staging copy.
   - App acknowledges with `DEVICE_CONFIG_ACK` including digest of received payload.
5. **Phase 3 ? Endpoint Setup**
   - App executes Secure Element operations:
     - `CREATE_ENDPOINT` (SE local call, not over BLE).
     - `SETUP_ENDPOINT` with mailbox offsets, derived keys.
   - App optionally requests Track Key registration via server.
   - App notifies vehicle with `ENDPOINT_READY` message containing endpointId hash.
6. **Phase 4 ? Finalization**
   - Vehicle sends `OP_CONTROL_FLOW` (`p1=end`, `p2=0x90/0x91`) to close pairing.
   - App stores KTS response (once obtained from server) in KeyAtt field, updates Signaling Bitmap via `SIG_BITMAP_UPDATE` command.
   - App persists success status and notifies server with attestation.

## 2. BLE Message Framing

- **Transport**: Single primary GATT service `0xCCC1`, characteristics:
  - `0xCCC1-0001` Command/Response (write with response, notify).
  - `0xCCC1-0002` Pairing Challenge (notify) ? optional; fallback to command characteristic.
  - `0xCCC1-0003` Result/Status (notify).
- **Frame Structure** (`BLEFrame`):
  - Header (6 bytes): `version | type | seq | totalSeq | payloadLength | flags`.
  - Body: encrypted payload (AES-GCM) with `Kenc`, nonce derived from `(sessionCounter || seq)`.
  - MAC: 16 bytes appended (GCM tag). For unencrypted pre-SPAKE frames, MAC omitted.
- **Frame Types**: `0x01 SELECT`, `0x02 SPAKE2_REQUEST`, `0x03 SPAKE2_RESPONSE`, `0x04 SPAKE2_VERIFY`, `0x05 SPAKE2_VERIFY_RESPONSE`, `0x06 DEVICE_CONFIG`, `0x07 DEVICE_CONFIG_ACK`, `0x08 ENDPOINT_READY`, `0x09 SIG_BITMAP_UPDATE`, `0x0A OP_CONTROL_FLOW`, `0x7F ERROR`.
- **Chunking**: `totalSeq` indicates total chunks; payload reassembled before processing. Maximum payload per frame 244 bytes (Bluetooth LE MTU 247 minus overhead).
- **Timeouts**:
  - Response wait per command: 5 s.
  - SPAKE2 sequence overall: 20 s.
  - Device configuration transfer: 30 s (auto-cancel if missing chunk beyond 5 s).
- **Retry Policy**:
  - Up to `maxAttempts` from server; each BLE failure increments local counter and reported via next HTTPS call.
  - Device emits `ERROR` frame with `code`, `detail`; app surfaces message and aborts.

## 3. Message Payload Schemas (BLE)

### SELECT Response

```
struct SelectResponse {
  uint8 appletVersionMajor;
  uint8 appletVersionMinor;
  uint8 protocolVersion;
  uint8 pairingMode; // 0x02 = owner pairing password supplied
  bytes capabilities; // bit flags (BLE only, NFC disabled)
}
```

### SPAKE2 Request

```
struct Spake2Request {
  uint8 version;
  uint8 attemptRemaining;
  bytes salt[16];
  uint32 scryptN;
  uint32 scryptR;
  uint32 scryptP;
  bytes vehicleNonce[16];
}
```

### SPAKE2 Response

```
struct Spake2Response {
  bytes pointX[65]; // uncompressed
  bytes deviceNonce[16];
}
```

### SPAKE2 Verify

```
struct Spake2Verify {
  bytes pointY[65];
  bytes evidence[32];
  uint8 policyFlags;
  bytes vehicleEntropy[16];
}
```

### Device Configuration

```
struct DeviceConfigHeader {
  uint16 vehicleIdLength;
  uint16 descriptorLength;
  uint16 mailboxLength;
  uint16 authorizedKeyCount;
}

struct DeviceConfig {
  DeviceConfigHeader header;
  bytes vehicleId[vehicleIdLength];
  bytes descriptor[descriptorLength]; // JSON or CBOR describing model, trim, etc.
  bytes mailbox[mailboxLength]; // TLV for offsets, sizes
  AuthorizedKey authorizedKeys[authorizedKeyCount];
  bytes policyDigest[32];
}

struct AuthorizedKey {
  bytes keyId[16];
  bytes publicKey[65];
  uint8 roleFlags;
}
```

### Endpoint Ready

```
struct EndpointReady {
  bytes endpointIdHash[16];
  uint8 seStatus; // 0 = ok, non-zero = error code
}
```

### Error Frame

```
struct ErrorFrame {
  uint8 phase; // 1=SPAKE, 2=Config, 3=Endpoint, 4=Finalize
  uint16 errorCode;
  uint8 retryAllowed; // boolean
  bytes detail[]; // optional ASCII
}
```

## 4. Server API Contract (Draft)

### POST /pairing/password/request

- **Request**

```
{
  "vehicleId": "string",
  "userToken": "JWT",
  "deviceInfo": {
    "platform": "android" | "ios",
    "model": "string",
    "appVersion": "string"
  }
}
```

- **Response**

```
{
  "sessionId": "uuid",
  "pairingPassword": "string", // 8 digits, expires quickly
  "expiresAt": "ISO8601",
  "maxAttempts": 5,
  "scrypt": { "N": 32768, "r": 8, "p": 1 }
}
```

### POST /pairing/session/start

- Validates password proof (client sends SPAKE pre-computation challenge).
- **Request**

```
{
  "sessionId": "uuid",
  "devicePublicInfo": {
    "deviceNonce": "base64",
    "pointX": "base64"
  }
}
```

- **Response**

```
{
  "transactionId": "uuid",
  "vehiclePublicKey": "base64",
  "policyFlags": 3,
  "vehicleNonce": "base64"
}
```

### POST /pairing/config/confirm

```
{
  "transactionId": "uuid",
  "configDigest": "hex",
  "endpointIdHash": "hex",
  "seStatus": 0
}
```

- Response: `{ "ack": true, "ktsEndpointUrl": "https://..." }`.

### POST /pairing/kts/response

```
{
  "transactionId": "uuid",
  "keyAttestation": {
    "signature": "base64",
    "issuedAt": "ISO8601"
  }
}
```

- Response: `{ "ack": true }`.

### Error Schema

```
{
  "code": "PAIRING_PASSWORD_EXPIRED",
  "message": "Pairing password expired",
  "remainingAttempts": 2,
  "retryAfter": 60
}
```

## 5. Persistence Requirements

### Client

- Secure Element: `ownerPrivateKey`, derived `Kenc/Kmac/Krmac`, `endpointCertificate`, `keyAttestation`.
- Keychain (app-scoped): `sessionId`, `transactionId`, `vehicleDescriptorDigest`, pairing audit entries.
- App Storage: pairing logs (`timestamp`, `phase`, `result`, `errorCode`).

### Server

- `PairingSessions` table: `{ sessionId, userId, vehicleId, status, issuedAt, expiresAt, attemptCount, scryptConfig }`.
- `PairingTransactions`: `{ transactionId, sessionId, vehiclePublicKeyHash, policyFlags, configDigest, endpointHash }`.
- `DigitalKeys`: `{ keyId, vehicleId, ownerUserId, state, keyMaterialHash, createdAt, revokedAt }`.
- `KeyAttestations`: `{ keyId, transactionId, signature, issuedAt, verified }`.
- Audit Log: Append-only events for SPAKE2+, config transfer, endpoint ready, finalization.

## 6. Open Questions

- Decide on payload encoding for `descriptor` and `mailbox` (CBOR vs JSON).
- Confirm BLE MTU size assumptions; adjust chunk size if using iOS default 185 bytes.
- Determine fallback path when Track Key Server is unreachable.
- Define policy flag bit meanings (e.g., requires PIN-to-drive, auto revoke on timeout).

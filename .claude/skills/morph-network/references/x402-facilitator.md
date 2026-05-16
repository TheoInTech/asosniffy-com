# Morph x402 Facilitator — Integration Reference

Official facilitator base URL: **`https://morph-rails.morph.network/x402`**

This is Morph's hosted x402 facilitator (built on the [Coinbase x402 protocol](https://github.com/coinbase/x402)). It is **request-and-response compatible with the Coinbase x402 SDK**, but **adds mandatory HMAC-SHA256 request signing** on the `/v2/verify` and `/v2/settle` endpoints. Standard x402 clients/middleware will not authenticate without injecting Morph's signing transport.

## Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /v2/verify` | HMAC | Verify whether a payment payload is valid before serving the resource |
| `POST /v2/settle` | HMAC | Submit the on-chain settlement |
| `GET  /v2/supported` | none | Discover supported schemes/networks/signers |

Rate limit: **10 QPS per Access Key**. Excess returns HTTP 429 with body `{"isValid":false,"invalidReason":"rate limit exceeded","success":false,"errorReason":"rate limit exceeded"}`.

## Credential acquisition

1. Visit https://morph-rails.morph.network/x402.
2. Connect a wallet (MetaMask or any EIP-1193 wallet).
3. Sign the login challenge.
4. Click **Create** to mint an Access Key + Secret Key pair.

Result:
- `morph_ak_...` — **Access Key**, sent in every header.
- `morph_sk_...` — **Secret Key**, used to compute HMAC, **never sent over the wire**.

**Important constraints:**
- The secret is displayed exactly once at creation. Losing it requires contacting Morph support.
- **One key pair per wallet address.** Plan accordingly for multi-env (dev/prod) setups — you need separate wallets.

## HMAC signing — required headers

| Header | Description |
|---|---|
| `MORPH-ACCESS-KEY` | Your Access Key |
| `MORPH-ACCESS-TIMESTAMP` | Request timestamp in **milliseconds**, within ±30s of server time |
| `MORPH-ACCESS-SIGN` | Base64-encoded HMAC-SHA256 over the signing payload |

## Signing algorithm

Build a map, recursively sort all keys lexicographically, serialize to compact JSON (no whitespace), then HMAC-SHA256 with the secret, then Base64.

**Sign map fields:**

| Field | Value | Required |
|---|---|---|
| `MORPH-ACCESS-KEY` | Access Key, same as header | Yes |
| `MORPH-ACCESS-TIMESTAMP` | Same as header (milliseconds, as string) | Yes |
| `MORPH-ACCESS-METHOD` | HTTP method, **uppercase** (`POST`, not `post`) | Yes |
| `MORPH-ACCESS-PATH` | **Full path including `/x402` prefix** (e.g., `/x402/v2/settle`), no query string | Yes |
| `MORPH-ACCESS-BODY` | Request body parsed as JSON object (omit field entirely if no body) | If body present |
| Query params | Flattened to top-level map; values are **string arrays** (`{"foo": ["bar"]}`) | If query present |

```text
signContent = JSON.serialize(signMap, sortKeys=true, compact=true)
signature   = Base64( HMAC-SHA256( secretKey, signContent ) )
```

## Deterministic serialization per language

- **Go**: `json.Marshal(map[string]interface{})` sorts keys automatically. No extra work.
- **JavaScript / TypeScript**: `JSON.stringify` preserves insertion order — **you must recursively sort keys yourself** before calling stringify.
- **Python**: `json.dumps(obj, sort_keys=True, separators=(',', ':'))` sorts and compacts in one call.

## TypeScript reference implementation

```typescript
import crypto from "crypto";

const ACCESS_KEY = process.env.MORPH_X402_ACCESS_KEY!; // "morph_ak_..."
const SECRET_KEY = process.env.MORPH_X402_SECRET_KEY!; // "morph_sk_..."
const API_ORIGIN = "https://morph-rails.morph.network";
const API_PREFIX = "/x402";

function sortObject(obj: any): any {
  if (Array.isArray(obj)) return obj.map(sortObject);
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc: any, k) => { acc[k] = sortObject(obj[k]); return acc; }, {});
  }
  return obj;
}

function sign(
  accessKey: string, secretKey: string, timestamp: string,
  method: string, path: string, rawQuery: string, rawBody: string
): string {
  const signMap: Record<string, any> = {
    "MORPH-ACCESS-KEY": accessKey,
    "MORPH-ACCESS-TIMESTAMP": timestamp,
    "MORPH-ACCESS-METHOD": method,
    "MORPH-ACCESS-PATH": path,
  };

  if (rawQuery) {
    const params = new URLSearchParams(rawQuery);
    params.forEach((v, k) => {
      if (signMap[k]) (signMap[k] as string[]).push(v);
      else signMap[k] = [v];
    });
  }
  if (rawBody) signMap["MORPH-ACCESS-BODY"] = JSON.parse(rawBody);

  const content = JSON.stringify(sortObject(signMap));
  return crypto.createHmac("sha256", secretKey).update(content).digest("base64");
}

export async function settlePayment(payload: object, requirements: object) {
  const timestamp = Date.now().toString();
  const method = "POST";
  const endpoint = "/v2/settle";
  const fullPath = API_PREFIX + endpoint; // "/x402/v2/settle" — used for SIGNING

  const body = JSON.stringify({
    x402Version: 2,
    paymentPayload: payload,
    paymentRequirements: requirements,
  });

  const signature = sign(ACCESS_KEY, SECRET_KEY, timestamp, method, fullPath, "", body);

  const resp = await fetch(`${API_ORIGIN}${fullPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "MORPH-ACCESS-KEY": ACCESS_KEY,
      "MORPH-ACCESS-TIMESTAMP": timestamp,
      "MORPH-ACCESS-SIGN": signature,
    },
    body,
  });
  return resp.json();
}
```

## Go reference implementation (RoundTripper pattern)

The recommended approach is a custom `http.RoundTripper` so the Coinbase x402 SDK can be used unchanged — signing is injected at the transport layer.

```go
package morph

import (
    "bytes"
    "crypto/hmac"
    "crypto/sha256"
    "encoding/base64"
    "encoding/json"
    "io"
    "net/http"
    "net/url"
    "strconv"
    "time"
)

func BuildSignContent(accessKey, timestamp, method, path, rawQuery, rawBody string) []byte {
    signMap := map[string]interface{}{
        "MORPH-ACCESS-KEY":       accessKey,
        "MORPH-ACCESS-TIMESTAMP": timestamp,
        "MORPH-ACCESS-METHOD":    method,
        "MORPH-ACCESS-PATH":      path,
    }
    if rawQuery != "" {
        values, _ := url.ParseQuery(rawQuery)
        for k, vs := range values { signMap[k] = vs }
    }
    if rawBody != "" {
        var bodyObj interface{}
        if err := json.Unmarshal([]byte(rawBody), &bodyObj); err == nil {
            signMap["MORPH-ACCESS-BODY"] = bodyObj
        }
    }
    content, _ := json.Marshal(signMap) // Go sorts map keys automatically
    return content
}

func Sign(accessKey, secretKey, ts, method, path, rawQuery, rawBody string) string {
    mac := hmac.New(sha256.New, []byte(secretKey))
    mac.Write(BuildSignContent(accessKey, ts, method, path, rawQuery, rawBody))
    return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

type MorphSignTransport struct {
    accessKey, secretKey string
    base                 http.RoundTripper
}

func NewMorphSignTransport(ak, sk string) *MorphSignTransport {
    return &MorphSignTransport{ak, sk, http.DefaultTransport}
}

func (t *MorphSignTransport) RoundTrip(req *http.Request) (*http.Response, error) {
    ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
    var body string
    if req.Body != nil {
        b, err := io.ReadAll(req.Body)
        if err != nil { return nil, err }
        body = string(b)
        req.Body = io.NopCloser(bytes.NewBuffer(b))
    }
    sig := Sign(t.accessKey, t.secretKey, ts, req.Method, req.URL.Path, req.URL.RawQuery, body)
    req.Header.Set("MORPH-ACCESS-KEY", t.accessKey)
    req.Header.Set("MORPH-ACCESS-TIMESTAMP", ts)
    req.Header.Set("MORPH-ACCESS-SIGN", sig)
    return t.base.RoundTrip(req)
}
```

Plug into the Coinbase SDK:

```go
httpClient := &http.Client{
    Transport: morph.NewMorphSignTransport("morph_ak_...", "morph_sk_..."),
    Timeout:   30 * time.Second,
}
fac := x402http.NewFacilitatorClient(&x402http.FacilitatorConfig{
    URL:        "https://morph-rails.morph.network/x402/v2",
    HTTPClient: httpClient,
})
```

## Request/response shapes (Coinbase-compatible)

### `POST /v2/verify`

Request:
```json
{
  "x402Version": 2,
  "paymentPayload": { /* signer-produced */ },
  "paymentRequirements": { /* server-declared */ }
}
```
Response (`x402.VerifyResponse`):
```json
{ "isValid": true, "invalidReason": "", "payer": "0x..." }
```

### `POST /v2/settle`

Request: same shape as `/verify`.

Response (`x402.SettleResponse`):
```json
{
  "success": true,
  "errorReason": "",
  "payer": "0x...",
  "transaction": "0x...",
  "network": "eip155:2818"
}
```

### `GET /v2/supported` (no auth)

```bash
curl 'https://morph-rails.morph.network/x402/v2/supported'
```
Response (verified live on 2026-05-16):
```json
{
  "kinds":[{"x402Version":2,"scheme":"exact","network":"eip155:2818"}],
  "extensions":[],
  "signers":{
    "eip155:*":[
      "0xb22C2E02997B10bc481907f05475C90047e84697",
      "0x5825a15d9bc768454C15531dc3EB1bd09A3664DC",
      "0x09168cc8a16A34e960D2843042490303D8cF5e7f"
    ]
  }
}
```

**Important:** As of writing, only Mainnet (`eip155:2818`) is advertised in `/supported`, but the official docs Go example settles against Hoodi (chainID 2910) with token `0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4` ("HoodiTestToken", 18 decimals, name `HoodiTestToken`, version `1.0`). Verify current live state before wiring a hardcoded chain/token; the discrepancy is likely an `/supported` listing gap rather than a Hoodi outage.

## Reference defaults from the Morph Go example

These are the values from the official complete example — useful when matching test config:

| Field | Value |
|---|---|
| Chain ID | `2910` (Hoodi testnet) |
| Network | `eip155:2910` |
| Token address | `0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4` |
| Token name (EIP-712) | `HoodiTestToken` |
| Token version (EIP-712) | `1.0` |
| Token decimals | `18` |
| `payTo` recipient (example) | `0x98a55f86E1a57bBf28e4eA9dD719874075Fe6513` |
| Price (example) | `0.01` |
| Scheme | `exact` |

## Error response table

All `/v2/*` errors use Coinbase-x402-compatible envelopes (both `isValid/invalidReason` and `success/errorReason` are populated so SDK consumers always see something):

```json
{ "isValid": false, "invalidReason": "...", "success": false, "errorReason": "..." }
```

| HTTP | Code | Cause |
|---|---|---|
| 401 | `missing auth headers` | One or more required HMAC headers missing |
| 401 | `invalid timestamp` | Timestamp not a valid integer |
| 401 | `timestamp expired` | More than ±30s drift from server clock |
| 401 | `invalid access key` | Access Key not found |
| 401 | `invalid signature` | HMAC mismatch — see debugging checklist below |
| 403 | `access key disabled` | Contact Morph team to re-enable |
| 429 | `rate limit exceeded` | Default 10 QPS per Access Key |

## Signature debugging checklist

If `invalid signature`, walk this list in order — almost every failure is one of these:

1. Fixed keys use the `MORPH-ACCESS-` prefix (uppercase, hyphens, exact).
2. Query params are **flattened** to the top-level map with **`string[]` array values**, not nested objects.
3. **Recursively** sorted lexicographically — sort nested objects too, not just the top level.
4. Compact JSON output (no extra spaces or newlines anywhere).
5. Timestamp is **milliseconds**, not seconds. `Date.now()` in JS, `time.Now().UnixMilli()` in Go.
6. HTTP method is **uppercase**.
7. `MORPH-ACCESS-PATH` is the **full URL path including `/x402`** (e.g., `/x402/v2/settle`), and does NOT include the query string.
8. `MORPH-ACCESS-BODY` is **omitted entirely** when the request has no body — don't send `null` or `""`.

## CAIP-2 reference

- Morph Mainnet: `eip155:2818`
- Morph Hoodi Testnet: `eip155:2910`

## FAQ

**Does `/v2/supported` require authentication?** No.

**Can I rotate my Access Key?** Not directly — contact Morph support. The Secret Key cannot be retrieved if lost; only re-issued.

**What's the difference vs the public x402.org facilitator?** Morph's adds HMAC-signed requests and is the path required for Morph-native settlement. The public facilitator does not support `eip155:2818` or `eip155:2910`.

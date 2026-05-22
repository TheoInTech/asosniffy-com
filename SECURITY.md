# Security Policy

## Reporting a Vulnerability

If you find a security issue in Sniffy — especially one that touches the x402
payment flow, the facilitator integration, wallet handling, or any code path
that affects user funds — please **do not open a public GitHub issue**.

Email **theoroque95@gmail.com** with:

- A clear description of the issue.
- Steps to reproduce.
- The smallest possible proof of concept (commands, payloads, or a short
  patch).
- Your assessment of the impact (e.g. funds at risk, data exposure, denial of
  service).

You can expect:

- An acknowledgement within **3 business days**.
- A written assessment of severity within **7 business days**.
- A fix or mitigation timeline once severity is agreed.
- Credit in the release notes when the fix ships, unless you ask to remain
  anonymous.

## Scope

In-scope:

- The `landing/` Next.js app deployed at the official Sniffy demo URL.
- The `scraper/` Hono API deployed at the official Sniffy API URL.
- The `packages/sdk`, `packages/cli`, and `packages/mcp` published to npm.
- `SKILL.md` content that instructs agents to take payment-related actions.

Out of scope (please report to the upstream project instead):

- Vulnerabilities in Morph's official x402 facilitator
  (`https://morph-rails.morph.network/x402`).
- Vulnerabilities in third-party libraries (report to the library directly).
- Findings that require physical access, social engineering, or stolen
  credentials.

## Hackathon Note

Sniffy runs on **Morph Mainnet only** (`eip155:2818`). Hoodi testnet support
was dropped on 2026-05-21; all paid `/diagnose` calls settle on mainnet and
are **non-refundable**. Treat any "funds drained" or "stuck payment" report
as production-priority.

## Apple Search Ads — JWT Key Rotation Runbook

Sniffy authenticates to Apple Search Ads (`/keywords/popularity` and, from
Phase 9 onward, `/keywords/recommendations`) using a `.p8` private key issued
in the Apple Ads UI. The key is held in the `APPLE_SEARCH_ADS_PRIVATE_KEY_PEM`
environment variable. If the key leaks, anyone holding it can call the Apple
Search Ads API as the org until the key is revoked.

**Rotation procedure (5 steps, ~5 minutes):**

1. **Generate a new key in the Apple Ads UI.** *Settings → API → Create Key*.
   Note the new `keyId`.
2. **Deploy the new key alongside the old one.** Add it to Railway env as a
   second variable, e.g. `APPLE_SEARCH_ADS_PRIVATE_KEY_PEM_NEW`. Do not
   delete the old key yet.
3. **Flip the primary.** Swap `APPLE_SEARCH_ADS_PRIVATE_KEY_PEM` to the new
   value (rename `_NEW` to the live name). Redeploy. Watch the deploy log
   for the `asa_jwt_key_fingerprint` line — the `fingerprint` field's last
   8 hex chars MUST match what Apple's UI shows for the new key.
4. **Revoke the old key.** Once the new fingerprint is observed in logs and
   `/api/v1/aso/diagnose` is still returning popularity data, return to the
   Apple Ads UI and revoke the old key. Old key can no longer be used.
5. **Verify.** Run one paid `/diagnose` call. Check the response includes
   `popularityScore` and `popularitySource: "apple-search-ads"` for at
   least one keyword. If not, roll back the env var swap and re-investigate.

The `asa_jwt_key_fingerprint` startup log is the only safe way to confirm
which key is live in production — the private material itself never appears
in logs. Sample log line:

```json
{"ts":"2026-05-22T01:46:08.513Z","level":"info","event":"asa_jwt_key_fingerprint","keyId":"ABCD1234EF","fingerprint":"a3b9f2c1"}
```

If a leak is suspected, rotate immediately. Steps 1-4 can be completed in
under 5 minutes if the new key is generated in advance.

# Sniffy Fixtures

This directory holds the canonical sample payloads used by:

1. **`GET /api/v1/aso/sample`** — always returns `sample-report.json` (with `sample: true` injected). Phase 02 wires the route.
2. **Schema round-trip tests** — `scraper/tests/schemas.test.ts` parses every file here to guarantee the Zod schemas in `src/schemas/` cover the §9 contract.
3. **Demo fallback** — when every live provider in `scraper/` fails, `/quote` and `/diagnose` paid responses fall back to these payloads (with provenance labels marking every field as `fixture`).

## Files

- `sample-quote.json` — populated `/quote` response. Synthetic app id `1000000001`, country `US`, one keyword in `shallowScan.previewKeyword`.
- `sample-report.json` — populated paid `/diagnose` response. `reportVersion` matches `SCHEMA_VERSION`. The receipt's `facilitatorMode` is `fixture-receipt` so judges can distinguish a real settled x402 receipt from this synthetic one at a glance.

## Rules when editing

- Field shape changes flow from `scraper/src/schemas/` → fixtures, not the other way around. If you change a fixture and break the schema, the test suite catches it.
- Keep the IDs clearly synthetic (`1000000001`, `sniff_sample_001`, `0xsample...`) so nobody confuses them with real App Store IDs or on-chain transactions.
- `dataProvenance` on `sample-report.json` is **always** `"fixture"` for every section — never `live` or `cached` here.

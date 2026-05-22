# @gosniffy/sdk

Typed TypeScript client for the [Sniffy](https://sniffy.io) ASO API — pay-per-sniff App Store keyword diagnosis, competitor analysis, and metadata recommendations. Paid endpoints settle over the [x402 protocol](https://x402.org) on Morph Hoodi testnet (`eip155:2910`).

## Install

```bash
npm i @gosniffy/sdk viem
# or pnpm add @gosniffy/sdk viem
```

`viem` is a peer dependency — bring your own wallet.

## Usage

```ts
import { createSniffy, PaymentRequiredError } from "@gosniffy/sdk";

const sniffy = createSniffy({
  baseUrl: "https://api.sniffy.io",       // default
  signer,                                  // optional viem account; required for .diagnose()
});

const quote = await sniffy.quote({ store: "ios", app, country, keywords });
try {
  const report = await sniffy.diagnose({ sniffId: quote.sniffId });
} catch (err) {
  if (err instanceof PaymentRequiredError) {
    // intercept and surface payment details to user
  }
  throw err;
}
```

### Three methods

| Method | Endpoint | Payment | Returns |
|--------|----------|---------|---------|
| `sniffy.sample()` | `GET /api/v1/aso/sample` | Free | Canned sample report (always works) |
| `sniffy.quote(input)` | `POST /api/v1/aso/quote` | Free | Quote with `shallowScan` preview |
| `sniffy.diagnose(input)` | `POST /api/v1/aso/diagnose` | x402 | Full paid report with receipt |

### Diagnose options

By default, `.diagnose()` auto-pays when a `signer` is configured. Pass `{ autoPay: false }` to intercept the 402 and drive the payment UX yourself:

```ts
try {
  await sniffy.diagnose(input, { autoPay: false });
} catch (err) {
  if (err instanceof PaymentRequiredError) {
    // err.response — full DiagnoseUnpaidResponse
    // err.payment  — x402 payment requirements (network, amount, asset, payTo, …)
    // err.sniffId  — request identifier
  }
}
```

## Wallet setup (testnet)

The default network is **Morph Hoodi testnet** (`eip155:2910`). Use a throwaway key — never paste a mainnet private key into a CLI or env file.

```ts
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.SNIFFY_PRIVATE_KEY as `0x${string}`);
const sniffy = createSniffy({ signer });
```

Fund the wallet with HoodiTestToken (the demo asset at `0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4`) via the [Morph faucet](https://faucet-hoodi.morph.network/).

## Provenance labels

Every report field carries a `provenance` label: `live | cached | fixture | inferred`. Surface them when reporting to the user — fixture results are best-effort, not real-time data.

## License

MIT

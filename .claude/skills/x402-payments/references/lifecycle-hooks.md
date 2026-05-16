# Lifecycle Hooks

Hooks intercept and modify payment flow events on clients, servers,
facilitators, and MCP wrappers. Use them for spending limits, API-key bypass,
audit logging, custom recovery, and compliance checks.

## Server hooks (`x402ResourceServer`, transport-agnostic)

Run for every payment regardless of route or extension.

| Hook                       | When                                          | Return to customize                                         |
|----------------------------|-----------------------------------------------|-------------------------------------------------------------|
| `onBeforeVerify`           | Before verification                           | `{ abort: true, reason }` to reject, `{ skip: true, result }` to use a locally-produced verify result |
| `onAfterVerify`            | After successful verification                 | `{ skipHandler: true, response? }` to settle without invoking the handler |
| `onVerifyFailure`          | On verification failure                       | `{ recovered: true, result }` to override                   |
| `onBeforeSettle`           | Before settlement                             | `{ abort: true, reason }` to reject, `{ skip: true, result }` to use a locally-produced settle result |
| `onAfterSettle`            | After successful settlement                   | (void)                                                      |
| `onSettleFailure`          | On settlement failure                         | `{ recovered: true, result }` to override                   |
| `onVerifiedPaymentCanceled`| Verified payment never settled (handler errored) | (void — for audit logging)                              |

```ts
import { x402ResourceServer } from "@x402/core";

const server = new x402ResourceServer(facilitatorClient);

server.onAfterSettle(async (context) => {
  await recordPayment({
    payer: context.result.payer,
    transaction: context.result.transaction,
    amount: context.requirements.amount,
    network: context.requirements.network,
  });
});
```

```python
from x402 import x402ResourceServer    # async; use x402ResourceServerSync for sync
server = x402ResourceServer(facilitator_client)

async def record_payment(context):
    await db.record(
        payer=context.result.payer,
        transaction=context.result.transaction,
        amount=context.requirements.amount,
    )

server.on_after_settle(record_payment)
```

```go
import x402 "github.com/x402-foundation/x402/go"
server := x402.Newx402ResourceServer(facilitatorClient)

server.OnAfterSettle(func(ctx x402.SettleResultContext) error {
    return db.RecordPayment(Payment{
        Payer:       ctx.Result.Payer,
        Transaction: ctx.Result.Transaction,
        Amount:      ctx.Requirements.Amount,
    })
})
```

## HTTP server hook (`x402HTTPResourceServer`)

Runs on every request to a protected route, **before** payment processing.
Use to bypass payment based on request context (API keys, subscription, etc.).

| Return value                      | Effect                                |
|-----------------------------------|---------------------------------------|
| `{ grantAccess: true }`           | Skip payment, run the handler         |
| `{ abort: true, reason }`         | Return 403                            |
| `void` / `undefined`              | Continue to normal payment flow       |

```ts
import { x402ResourceServer, x402HTTPResourceServer } from "@x402/core";

const server = new x402ResourceServer(facilitatorClient);
const httpServer = new x402HTTPResourceServer(server, routes);

httpServer.onProtectedRequest(async (context, routeConfig) => {
  const apiKey = context.adapter.getHeader("X-API-Key");
  if (apiKey && await isValidApiKey(apiKey)) {
    return { grantAccess: true };
  }
  // No valid key → fall through to payment flow
});
```

Common patterns:

- **API key bypass** — let internal services skip payment via a shared key.
- **Subscription bypass** — JWT/session for human users on the same endpoint
  that AI agents pay for.
- **Allow/block lists** — reject known abusers with `abort: true`.

## Client hooks (`x402Client`, transport-agnostic)

| Hook                       | When                                | Return to customize                              |
|----------------------------|-------------------------------------|--------------------------------------------------|
| `onBeforePaymentCreation`  | Before signing a payment payload    | `{ abort: true, reason }` to cancel              |
| `onAfterPaymentCreation`   | After successful payload creation   | (void)                                           |
| `onPaymentCreationFailure` | Payload creation failed             | `{ recovered: true, payload }` to provide fallback |
| `onPaymentResponse`        | After paid request completes        | `{ recovered: true }` to retry with a fresh payload |

```ts
// Spending limit
client.onBeforePaymentCreation(async (context) => {
  const max = BigInt("10000000");  // 10 USDC at 6 decimals
  const requested = BigInt(context.selectedRequirements.amount);
  if (requested > max) {
    return { abort: true, reason: "Payment exceeds spending limit" };
  }
});
```

```python
from x402 import x402Client
from x402.types import AbortResult

client = x402Client()

async def enforce_spending_limit(context):
    if int(context.selected_requirements.amount) > 10_000_000:
        return AbortResult(abort=True, reason="Payment exceeds spending limit")

client.on_before_payment_creation(enforce_spending_limit)
```

```go
client := x402.Newx402Client()

client.OnBeforePaymentCreation(func(ctx x402.PaymentCreationContext) (*x402.BeforePaymentCreationResult, error) {
    requested, _ := new(big.Int).SetString(ctx.Requirements.Amount, 10)
    if requested.Cmp(big.NewInt(10_000_000)) > 0 {
        return &x402.BeforePaymentCreationResult{
            Abort:  true,
            Reason: "Payment exceeds spending limit",
        }, nil
    }
    return nil, nil
})
```

## HTTP client hook (`x402HTTPClient`)

Runs when a 402 is received, **before** kicking off the payment flow.

| Return value                | Effect                                                              |
|-----------------------------|---------------------------------------------------------------------|
| `{ headers: {...} }`        | Retry the original request with alternate headers (e.g., API key)   |
| `void` / `undefined`        | Proceed to normal payment flow                                      |

```ts
const httpClient = new x402HTTPClient(client);

httpClient.onPaymentRequired(async ({ paymentRequired }) => {
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    return { headers: { Authorization: `Bearer ${apiKey}` } };
  }
});
```

Use this to try free authentication paths before paying — e.g., the client
has an API key for internal services but falls back to paid access when used
against third-party endpoints.

## Facilitator hooks (`x402Facilitator`)

Identical pattern to server hooks (`onBefore/After/Failure` for verify and
settle). Use cases: populating a Bazaar catalog, compliance checks,
cross-payment metrics.

```ts
import { x402Facilitator } from "@x402/core";
import { extractDiscoveryInfo } from "@x402/extensions/bazaar";

const facilitator = new x402Facilitator();

facilitator.onAfterVerify(async (context) => {
  const discovered = extractDiscoveryInfo(
    context.paymentPayload,
    context.requirements,
    true,
  );
  if (discovered) {
    bazaarCatalog.add({
      resource: discovered.resourceUrl,
      description: discovered.description,
      mimeType: discovered.mimeType,
      accepts: [context.requirements],
      lastUpdated: new Date().toISOString(),
    });
  }
});
```

## MCP client hooks (`x402MCPClient`)

Run during tool-call payment lifecycle. **First hook to return a result wins.**

| Hook                | When                       | Return to customize                                                   |
|---------------------|----------------------------|-----------------------------------------------------------------------|
| `onPaymentRequired` | 402 received from a tool   | `{ abort: true }` to cancel, `{ payment }` to supply a pre-built payload, void to proceed |
| `onBeforePayment`   | After approval, before payload creation | (void)                                                  |
| `onAfterPayment`    | After tool result received | (void — typical use: audit logging)                                   |

```ts
import { x402MCPClient } from "@x402/mcp";

const client = new x402MCPClient(mcpClient, paymentClient);

client
  .onPaymentRequired(async ({ toolName, paymentRequired }) => {
    if (blocklist.has(toolName)) return { abort: true };
  })
  .onAfterPayment(async ({ toolName, settleResponse }) => {
    await auditLog.record({ tool: toolName, transaction: settleResponse?.transaction });
  });
```

## MCP server hooks (payment wrapper)

Registered in `PaymentWrapperConfig.hooks` when creating the wrapper.

| Hook                | When                                  | Return to customize          |
|---------------------|---------------------------------------|------------------------------|
| `onBeforeExecution` | After verification, before tool runs  | `false` to abort execution   |
| `onAfterExecution`  | After tool returns, before settlement | (void)                       |
| `onAfterSettlement` | After successful settlement           | (void — for receipts)        |

```ts
import { createPaymentWrapper } from "@x402/mcp";

const paid = createPaymentWrapper(resourceServer, {
  accepts,
  hooks: {
    onBeforeExecution: async ({ toolName, paymentPayload }) => {
      if (await isRateLimited(paymentPayload.payer)) return false;
    },
    onAfterSettlement: async ({ settlement }) => {
      await sendReceipt({ transaction: settlement.transaction });
    },
  },
});
```

## Hook chaining

Hooks can be chained on a single call:

```ts
server
  .onBeforeVerify(validatePayment)
  .onAfterVerify(logVerification)
  .onBeforeSettle(checkBalance)
  .onAfterSettle(recordTransaction);
```

```python
(server
  .on_before_verify(validate_payment)
  .on_after_verify(log_verification)
  .on_before_settle(check_balance)
  .on_after_settle(record_transaction))
```

```go
server.
    OnBeforeVerify(validatePayment).
    OnAfterVerify(logVerification).
    OnBeforeSettle(checkBalance).
    OnAfterSettle(recordTransaction)
```

## Extension-scoped hooks

Extensions can contribute hooks via the `hooks` field of `ResourceServerExtension`.
Extension hooks only run when that extension is declared on the route, and
receive the per-route declaration as the first argument. See
[extensions.md](extensions.md) for the interface.

## SDK availability

| Hook                       | TS  | Go  | Python |
|----------------------------|-----|-----|--------|
| Client `onBefore/AfterPaymentCreation`, `onPaymentCreationFailure` | ✅ | ✅ | ✅ |
| Client `onPaymentResponse`            | ✅  | ✅  | ❌   |
| HTTP client `onPaymentRequired`       | ✅  | ❌  | ❌   |
| Server verify/settle hooks            | ✅  | ✅  | ✅   |
| Server `onVerifiedPaymentCanceled`    | ✅  | ✅  | ❌   |
| HTTP server `onProtectedRequest`      | ✅  | ✅  | ❌   |
| Facilitator verify/settle hooks       | ✅  | ✅  | ✅   |
| MCP client hooks (`onPaymentRequired`/`onBefore/AfterPayment`) | ✅ | ❌ | ❌ |
| MCP server payment wrapper hooks      | ✅  | ❌  | ❌   |

See [sdk-features.md](sdk-features.md) for the full parity matrix.

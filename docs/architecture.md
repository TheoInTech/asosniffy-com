# Sniffy Architecture

Two canonical Mermaid diagrams of the running system. They are the visual companions to `PLAN.md` §6 (system architecture) and `PLAN.md` §9 (API contract), and they assume the load-bearing constraints in `CLAUDE.md`.

- **Diagram 1 — System architecture.** Trust boundaries (Client / Vercel / Railway / Morph), the x402 paid loop, and the surrounding storage + provider edges.
- **Diagram 2 — Scraper `/diagnose` internals.** The paid endpoint end-to-end: middleware, payment, cache/providers, scoring, synthesis, response assembly.

Both diagrams represent the **intended live path**. Operational state (degraded facilitator, fixture-receipt mode) is tracked in runbook notes, not here.

**Legend**

- Amber nodes: x402 payment surface.
- Green nodes: provenance assignment (the four labels — `live`, `cached`, `fixture`, `degraded` — enforced by `scraper/src/cache/wrapper.ts` and `scraper/src/data/coverage.ts`).
- Blue node: settlement target on Morph.

---

## Diagram 1 — System architecture

```mermaid
flowchart LR
    subgraph Client["Client (holds signer)"]
        BR["Browser<br/>Reown AppKit + wagmi"]
        CLI["@sniffy/cli"]
        MCP["@sniffy/mcp"]
        SDK["@sniffy/sdk"]
    end

    subgraph Vercel["Vercel · landing/"]
        LP["Next.js routes<br/>/, /sample, /trail/[sniffId]"]
        LAC["API client<br/>lib/api/client.ts"]
        LX4["buildPaymentHeader<br/>EIP-3009 signTypedData"]
    end

    subgraph Railway["Railway · scraper/ (Hono, Docker node:22-slim)"]
        MW["Middleware<br/>requestId · audit · cors<br/>rate-limit · cost · origin · Zod"]
        R_S["POST /api/v1/aso/sample"]
        R_Q["POST /api/v1/aso/quote"]
        R_D["POST /api/v1/aso/diagnose<br/>x402 paywall"]
        R_H["GET /api/v1/aso/history/*"]
        R_W["/api/v1/aso/wallet/* SIWE"]
        PAY["Payment layer<br/>requirements · header · receipt"]
        FAC_CLI["Facilitator client<br/>HMAC-SHA256 signed"]
        ORCH["Report orchestrator"]
        PROV_A["Apple providers<br/>iTunes · storefront · reviews-rss<br/>keyword-rank · search-ads-popularity"]
        PROV_G["Android providers"]
        SYN["Synthesis<br/>OpenAI + template fallback"]
    end

    subgraph Store["Upstash Redis"]
        REDIS[("Provider cache<br/>Rate-limit buckets<br/>SIWE nonces + sessions<br/>Rank timeseries · wallet history")]
    end

    subgraph Morph["Morph"]
        FAC["x402 Facilitator<br/>morph-rails.morph.network/x402"]
        CHAIN["Morph Hoodi<br/>eip155:2910"]
    end

    subgraph External["External providers"]
        APPLE["itunes.apple.com"]
        PLAY["Google Play"]
        OAI["OpenAI"]
    end

    BR --> LP --> LAC
    BR --> LX4
    LAC -- "1. POST /diagnose (no header)" --> MW
    MW -- "2. 402 + PAYMENT-REQUIRED" --> LAC
    LAC -- sign --> LX4
    LX4 -- "3. POST /diagnose + PAYMENT-SIGNATURE" --> MW
    MW -- "4. 200 + PAYMENT-RESPONSE" --> LAC

    CLI -- "PAYMENT-SIGNATURE retry" --> MW
    MCP -- "PAYMENT-SIGNATURE retry" --> MW
    SDK -- "PAYMENT-SIGNATURE retry" --> MW

    MW --> R_S
    MW --> R_Q
    MW --> R_D
    MW --> R_H
    MW --> R_W

    R_D --> PAY
    R_D --> ORCH
    R_Q --> ORCH
    R_S --> ORCH
    R_H --> REDIS
    R_W --> REDIS

    PAY --> FAC_CLI
    FAC_CLI -- verify --> FAC
    FAC_CLI -- settle --> FAC
    FAC --> CHAIN

    ORCH --> PROV_A
    ORCH --> PROV_G
    ORCH --> SYN
    PROV_A <--> REDIS
    PROV_G <--> REDIS
    ORCH <--> REDIS

    PROV_A --> APPLE
    PROV_G --> PLAY
    SYN --> OAI

    classDef payment fill:#fef3c7,stroke:#f59e0b,color:#78350f
    classDef chain fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
    class R_D,PAY,FAC_CLI,LX4,FAC payment
    class CHAIN chain
```

**Evidence anchors**

- Middleware mount: `scraper/src/index.ts:21-78`
- Payment requirements: `scraper/src/payment/requirements.ts:68-141`
- Facilitator HMAC client: `scraper/src/payment/facilitator/client.ts:70-163`
- Header read on retry: `scraper/src/routes/diagnose.ts:54`
- 200 + `PAYMENT-RESPONSE` set: `scraper/src/routes/diagnose.ts:294`
- Browser EIP-3009 signing: `landing/src/lib/wallet/x402.ts:95-163`

---

## Diagram 2 — Scraper `/diagnose` internals

```mermaid
flowchart TD
    REQ[["POST /api/v1/aso/diagnose"]] --> MW

    subgraph MWStack["Middleware (scraper/src/index.ts + middleware/*)"]
        MW["requestId → audit → logger<br/>cors → validate-body (Zod)"]
    end

    MW --> PAY_CHECK{"PAYMENT-SIGNATURE<br/>header present?"}
    PAY_CHECK -- no --> PAY_BUILD["buildPaymentRequirements<br/>compute pricing + accepts[]"]
    PAY_BUILD --> R402(["402 + PAYMENT-REQUIRED<br/>(base64 JSON offer)"])

    PAY_CHECK -- yes --> PAY_PARSE["parsePaymentHeader<br/>EIP-3009 PaymentPayloadV2"]
    PAY_PARSE --> PAY_AMT{"amount + payTo<br/>match offer?"}
    PAY_AMT -- no --> R402_AMT(["402 amount_mismatch"])
    PAY_AMT -- yes --> VERIFY["Facilitator.verify<br/>HMAC-signed POST /v2/verify"]
    VERIFY --> ORCH

    subgraph DataPlane["Data plane (data/report-data.ts · cache/wrapper.ts)"]
        ORCH["generateReportWithMeta"] --> DETECT["Detect app identity"]
        DETECT --> FANOUT{{"Promise.all fan-out"}}
        FANOUT --> RANKS["Keyword ranks"]
        FANOUT --> COMP["Competitor data"]
        FANOUT --> POP["Popularity (ASA + heuristic)"]
        FANOUT --> REV["Reviews"]
        RANKS --> CACHE_W["withCache"]
        COMP --> CACHE_W
        POP --> CACHE_W
        REV --> CACHE_W
        CACHE_W --> CACHE_HIT{"cache hit?"}
        CACHE_HIT -- yes --> P_CACHED["provenance: cached<br/>(rewrite live → cached)"]
        CACHE_HIT -- no --> PROV_CALL["Call provider"]
        PROV_CALL --> PROV_OK{"provider ok?"}
        PROV_OK -- yes --> P_LIVE["provenance: live"]
        PROV_OK -- "no + allowFixtureFallback" --> P_FIX["provenance: fixture"]
        PROV_OK -- "no + diagnose/quote" --> P_DEG["provenance: degraded"]
    end

    P_CACHED --> SCORE
    P_LIVE --> SCORE
    P_FIX --> SCORE
    P_DEG --> SCORE

    SCORE["Scoring (deterministic)<br/>scoreMetadata · scoreKeywords · scoreCompetitors"] --> SYN_GATE{"inputs fixture<br/>or degraded?"}
    SYN_GATE -- yes --> SYN_TPL["Template synthesis"]
    SYN_GATE -- no --> SYN_AI["OpenAI structured JSON"]
    SYN_AI -- "empty / JSON-fail / Zod-fail" --> SYN_TPL
    SYN_AI -- ok --> HIST
    SYN_TPL --> HIST

    subgraph Overlay["History + localization overlay"]
        HIST["Rank history read · trend · regressions<br/>fire-and-forget history persist"] --> LOC["Localization gap (iOS-only, franc)"]
        LOC --> MOM["Target-app momentum"]
    end

    MOM --> ASSEMBLE["assemble paid response<br/>+ coverage + worstProvenance"]
    ASSEMBLE --> SETTLE["Facilitator.settle<br/>HMAC-signed POST /v2/settle"]
    SETTLE --> RECEIPT["assembleReceipt<br/>(network, chainId, txHash, settledAt)"]
    RECEIPT --> WHIST["Wallet-history ZSET write<br/>(fire-and-forget)"]
    WHIST --> RESP[["200 + PAYMENT-RESPONSE<br/>(base64 JSON receipt)"]]

    classDef payment fill:#fef3c7,stroke:#f59e0b,color:#78350f
    classDef prov fill:#dcfce7,stroke:#16a34a,color:#14532d
    class PAY_BUILD,PAY_PARSE,VERIFY,SETTLE,RECEIPT,R402,R402_AMT,RESP payment
    class P_CACHED,P_LIVE,P_FIX,P_DEG prov
```

**Evidence anchors**

- Diagnose route lifecycle: `scraper/src/routes/diagnose.ts:34-310`
- Cache wrapper + `live → cached` rewrite: `scraper/src/cache/wrapper.ts:39-110`
- Provider fan-out: `scraper/src/data/report-data.ts:116-170`
- Synthesis gate + template fallback: `scraper/src/synthesis/openai.ts:67-195`, `scraper/src/synthesis/template.ts`
- `worstProvenance`: `scraper/src/data/coverage.ts:65-72`
- Wallet-history write: `scraper/src/wallet/history.ts`, `scraper/src/routes/diagnose.ts:255-290`

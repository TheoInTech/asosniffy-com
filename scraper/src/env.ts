import { z } from "zod";

const BooleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    return value === "true" || value === "1";
  });

const EvmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "EVM address (0x-prefixed 20-byte hex)");

const CAIP2 = z
  .string()
  .regex(/^eip155:\d+$/, "CAIP-2 identifier, eip155:<chainId>");

const CsvOrigins = z
  .string()
  .transform((raw) =>
    raw
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );

// Per-network payment-asset config lives in env as suffixed _MAINNET / _HOODI
// vars. env.ts resolves the active set based on MORPH_NETWORK at boot, so
// downstream callers keep reading env.SNIFFY_PAYMENT_ASSET_* (un-suffixed).
const OptionalAddress = EvmAddress.optional();
const OptionalDecimals = z.coerce.number().int().min(0).max(36).optional();
const OptionalString = z.string().min(1).optional();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  ALLOWED_ORIGINS: CsvOrigins.default(
    "http://localhost:3000,http://localhost:3001",
  ),

  // Selector: which Morph network the payment adapter targets.
  // Default `eip155:2818` (Morph Mainnet) — the official facilitator only
  // lists Mainnet in /v2/supported. Hoodi is opt-in via MORPH_NETWORK=eip155:2910.
  MORPH_NETWORK: CAIP2.default("eip155:2818"),
  MORPH_FACILITATOR_URL: z
    .string()
    .url()
    .default("https://morph-rails.morph.network/x402"),
  MORPH_FACILITATOR_MODE: z
    .enum(["morph-official", "fixture-receipt", "self-hosted-fallback"])
    .default("morph-official"),
  MORPH_FACILITATOR_ACCESS_KEY: z.string().min(1).optional(),
  MORPH_FACILITATOR_SECRET_KEY: z.string().min(1).optional(),

  // Merchant + token config. Merchant has no safe default — payment requires
  // it. Token config is resolved per-network from the suffixed vars below.
  SNIFFY_MERCHANT_ADDRESS: EvmAddress.optional(),

  // Per-network payment asset config. All optional — fall through to built-in
  // defaults if absent. Legacy un-suffixed names (SNIFFY_PAYMENT_ASSET_*)
  // remain accepted as a back-compat fallback for the active network.
  SNIFFY_PAYMENT_ASSET_ADDRESS: OptionalAddress,
  SNIFFY_PAYMENT_ASSET_DECIMALS: OptionalDecimals,
  SNIFFY_PAYMENT_ASSET_EIP712_NAME: OptionalString,
  SNIFFY_PAYMENT_ASSET_EIP712_VERSION: OptionalString,

  SNIFFY_PAYMENT_ASSET_ADDRESS_MAINNET: OptionalAddress,
  SNIFFY_PAYMENT_ASSET_DECIMALS_MAINNET: OptionalDecimals,
  SNIFFY_PAYMENT_ASSET_EIP712_NAME_MAINNET: OptionalString,
  SNIFFY_PAYMENT_ASSET_EIP712_VERSION_MAINNET: OptionalString,

  SNIFFY_PAYMENT_ASSET_ADDRESS_HOODI: OptionalAddress,
  SNIFFY_PAYMENT_ASSET_DECIMALS_HOODI: OptionalDecimals,
  SNIFFY_PAYMENT_ASSET_EIP712_NAME_HOODI: OptionalString,
  SNIFFY_PAYMENT_ASSET_EIP712_VERSION_HOODI: OptionalString,

  RESOURCE_BASE_URL: z.string().url().optional(),

  ENABLE_REQUEST_LOG: BooleanFromString.default(true),

  // Cache: Upstash REST is the production path; in-memory Map fallback when
  // either of these is missing (works for local dev and tests with no infra).
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // Cache TTLs in seconds. Defaults retuned in Phase 4 per the plan —
  // freshness > saving cycles, because the cache-poisoning risk drops
  // when entries expire faster and quarantine catches the rest.
  //   appMetadata    6h (down from 24h — title/icon/screenshots can change)
  //   keywordRank    1h (volatile — rank moves daily)
  //   androidPreview 24h (preview-quality, low confidence anyway)
  //   fullReport     30min (we want fresh paid reports)
  // asaPopularity has its own env var (ASA_POPULARITY_CACHE_TTL_DAYS,
  // default 7d). rankHistory has no TTL — managed via ZREMRANGEBYSCORE.
  CACHE_TTL_APP_METADATA: z.coerce.number().int().positive().default(21600),
  CACHE_TTL_KEYWORD_RANK: z.coerce.number().int().positive().default(3600),
  CACHE_TTL_ANDROID_PREVIEW: z.coerce.number().int().positive().default(86400),
  CACHE_TTL_FULL_REPORT: z.coerce.number().int().positive().default(1800),

  // Phase 2 — Resilient scraping infrastructure.
  //
  // Per-host rate budgets in requests per minute. iTunes' documented cap is
  // ~200/min/IP in practice (per anecdotal community measurements); the
  // original 18/min default was deliberately conservative. Phase 9 raises
  // the budget to 45/min ahead of the multi-keyword competitor intersection
  // launch (Day 2 in plan): a 5-keyword /diagnose with intersection can
  // fan out to ~22 lookup/search calls. At 18/min, two concurrent paid
  // calls would queue and blow p95; at 45/min we cover two concurrent
  // diagnoses with headroom while staying well below Apple's ceiling.
  // Google Play has no documented cap and the unofficial scraper
  // recommends ≤5/min behind a proxy to avoid the 503+captcha + 1h IP-ban
  // response.
  ITUNES_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(45),
  GOOGLE_PLAY_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(5),
  // Phase 9 — shared Apple Search Ads ORG-level token bucket. Both the
  // existing popularity provider AND the upcoming /recommendations
  // provider (Day 3) consume Apple's per-org TPS quota (~100/min). Set
  // to 60/min by default — 40% margin under the quota, so simultaneous
  // popularity + recommendations calls on the same /diagnose don't
  // starve each other.
  ASA_ORG_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),

  // Phase 9 (Day 2) — multi-keyword competitor intersection. When true,
  // the iOS competitor collector searches ALL user keywords in parallel
  // and keeps apps that appear in ≥2 result sets — far better category-
  // relevance signal than the legacy "search first keyword, take top 5"
  // path. Default false at first deploy; flip after observing one day
  // of SLO metrics with the raised iTunes budget.
  COMPETITOR_INTERSECTION_ENABLED: BooleanFromString.default(false),

  // Phase 9 (Day 4) — App Store + Play Store search autocomplete as a
  // keyword candidate source. Both providers default to fail-silent
  // (a network error returns empty hits + a coverage warning, never a
  // 500); Google has a built-in circuit breaker that opens for 10
  // minutes after 3 consecutive 429/403s so a sustained block doesn't
  // burn the iTunes/Play budget. Off by default for first deploy.
  AUTOCOMPLETE_ENABLED: BooleanFromString.default(false),

  // Phase 9 (Day 5) — Semantic-similarity gating via OpenAI embeddings.
  // When true, the relevance gate adds an embedding-cosine term to its
  // score formula (cosine against the target app's vector text). When
  // false, the gate uses Day-1 form (category-match + intent only).
  // Default off — flip after the i18n eval harness shows the gate
  // doesn't over-reject on non-English fixtures (≤30% rejection rate
  // and ≤1 false-positive per 10 rejections eyeballed). See
  // scraper/eval/relevance-i18n.eval.ts.
  RELEVANCE_GATE_ENABLED: BooleanFromString.default(false),
  RETRY_BASE_MS: z.coerce.number().int().positive().default(250),
  RETRY_CAP_MS: z.coerce.number().int().positive().default(8000),
  RETRY_ATTEMPTS: z.coerce.number().int().min(0).max(5).default(3),

  // Proxy adapter. Optional. When PROXY_URL is set and a provider name
  // appears in PROXY_ENABLED_PROVIDERS (csv), the provider's HTTP layer
  // routes through the proxy. Recommended provider: QuotaGuard for Railway
  // (https://www.quotaguard.com/integrations/railway-static-ip).
  PROXY_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().optional(),
  ),
  PROXY_ENABLED_PROVIDERS: z
    .string()
    .default("")
    .transform((raw) =>
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),

  // Android provider selector:
  //   gplay-scraper - use facundoolano/google-play-scraper (default; ToS-grey, ~1h ban risk under load)
  //   serpapi       - use SerpAPI's Google Play endpoint (production-grade, paid)
  //   disabled      - return fixture/degraded for Android (kill-switch)
  GOOGLE_PLAY_PROVIDER: z
    .enum(["gplay-scraper", "serpapi", "disabled"])
    .default("gplay-scraper"),
  SERPAPI_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().optional(),
  ),

  // Phase 3 — Apple Search Ads (popularity score, the canonical iOS demand
  // signal). Disabled by default. The Apple Ads developer account onboarding
  // takes 1–3 business days; flipping ENABLED=true at boot is the gate.
  APPLE_SEARCH_ADS_ENABLED: BooleanFromString.default(false),
  APPLE_SEARCH_ADS_CLIENT_ID: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().optional(),
  ),
  APPLE_SEARCH_ADS_TEAM_ID: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().optional(),
  ),
  APPLE_SEARCH_ADS_KEY_ID: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().optional(),
  ),
  APPLE_SEARCH_ADS_PRIVATE_KEY_PEM: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().optional(),
  ),
  APPLE_SEARCH_ADS_ORG_ID: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().optional(),
  ),
  // Apple Ads endpoint is configurable so post-merge endpoint changes don't
  // require a code deploy. Defaults to v5 base; production deploys can flip
  // to v4 / a staging URL.
  APPLE_SEARCH_ADS_BASE_URL: z
    .string()
    .url()
    .default("https://api.searchads.apple.com/api/v5"),
  APPLE_SEARCH_ADS_TOKEN_URL: z
    .string()
    .url()
    .default("https://appleid.apple.com/auth/oauth2/token"),
  // Popularity scores move on weekly cycles; 7d is the right TTL.
  ASA_POPULARITY_CACHE_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // Phase 4 — Ranking history + schema-drift monitoring.
  //
  // RANK_HISTORY_ENABLED gates the ZSet writes on every paid /diagnose.
  // SHAPE_DRIFT_ENABLED gates the per-provider shape hashing.
  // SNIFFY_HISTORY_HMAC_SECRET signs the historySignature returned in
  // /diagnose responses so the /history endpoint can verify the caller
  // paid for the underlying series. Without the secret, /history returns
  // 401; with it, history is free for the wallet that paid the original
  // /diagnose (no second x402 charge).
  RANK_HISTORY_ENABLED: BooleanFromString.default(true),
  SHAPE_DRIFT_ENABLED: BooleanFromString.default(true),
  SNIFFY_HISTORY_HMAC_SECRET: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(32).optional(),
  ),

  // Phase 5 — Localization gap analysis + anti-abuse + cost circuit.
  LOCALIZATION_ENABLED: BooleanFromString.default(true),
  // Wave 1 — free-quote AI-mention teaser bit (one cheap OpenAI call,
  // cached 7 days). Default off until flipped in Railway post-COGS-check.
  AI_MENTION_TEASER_ENABLED: BooleanFromString.default(false),
  // Wave 2.1 — paid LLM share-of-voice probe (V5-calibrated: 10 prompts x
  // 2 replicates per intent, ~$0.02/report measured). Default off until
  // flipped in Railway.
  LLM_PROBE_ENABLED: BooleanFromString.default(false),
  // Wave 2.2 — web discoverability audit (4 bounded fetches of the
  // detected marketing domain, deterministic parsing, cached weekly).
  // Gates both the paid webDiscoverability section and the free-quote
  // webPlumbing teaser booleans.
  WEB_AUDIT_ENABLED: BooleanFromString.default(false),
  // Cost-aware pricing — vision creative pass (Wave 1.2 feature, not yet
  // built). The flag + caps land now so the pricing machinery treats vision
  // as a budgeted, capped capability from day one. The caps are LOAD-BEARING
  // for economics: they bound the projected COGS the `creativeVision` add-on
  // price is sized against. Default off; flip only after a capped re-measure.
  VISION_CREATIVE_ENABLED: BooleanFromString.default(false),
  // Hard image cap = OWN(5) + COMPETITORS(3) × EACH(1) = 8 images. The direct
  // fix for the $0.18 measurement (uncapped ~25 full-detail images).
  VISION_MAX_OWN_IMAGES: z.coerce.number().int().min(1).max(10).default(5),
  VISION_MAX_COMPETITORS: z.coerce.number().int().min(0).max(10).default(3),
  VISION_COMPETITOR_IMAGES_EACH: z.coerce.number().int().min(0).max(3).default(1),
  // Image-token controls: low detail + downscale bound input tokens/image.
  VISION_IMAGE_DETAIL: z.enum(["low", "auto"]).default("low"),
  VISION_MAX_IMAGE_PX: z.coerce.number().int().min(256).max(2048).default(768),
  // Cheapest capable vision model. Confirm the exact id + per-image pricing
  // (claude-api skill) before flipping VISION_CREATIVE_ENABLED.
  VISION_MODEL: z.string().min(1).default("gpt-5.4-mini"),
  // Cost-aware pricing — hard cap on storefronts sent to the localized-copy
  // OpenAI call (its output tokens scale with storefront count). Bounds the
  // `localizationCopy` projected COGS.
  LOCALIZATION_MAX_STOREFRONTS: z.coerce.number().int().min(1).max(40).default(10),
  // Default storefront set per PLAN.md §5. Configurable per request via
  // the localization input; this env is the global default when no
  // request-level override is provided.
  LOCALIZATION_STOREFRONTS: z
    .string()
    .default("US,GB,JP,DE,BR,KR")
    .transform((raw) =>
      raw
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c)),
    ),

  // Rate limits — sliding-minute + daily caps via Redis token bucket.
  RL_DISABLED: BooleanFromString.default(false),
  RL_SAMPLE_PER_MIN: z.coerce.number().int().positive().default(30),
  RL_SAMPLE_PER_DAY: z.coerce.number().int().positive().default(300),
  RL_QUOTE_PER_MIN: z.coerce.number().int().positive().default(10),
  RL_QUOTE_PER_DAY: z.coerce.number().int().positive().default(60),
  RL_QUOTE_PER_TUPLE_PER_HOUR: z.coerce.number().int().positive().default(3),
  RL_HISTORY_PER_MIN: z.coerce.number().int().positive().default(60),

  // Cost circuit breaker — when iTunes budget usage in the last 10 minutes
  // exceeds this percentage of the configured rate limit, free endpoints
  // return 503 while paid /diagnose keeps running.
  COST_CIRCUIT_THRESHOLD_PCT: z.coerce.number().int().min(0).max(100).default(80),

  // Origin attestation. /quote requires X-Sniffy-Client header by default;
  // /sample always allows headerless callers per CLAUDE.md.
  ABUSE_REQUIRE_SNIFFY_CLIENT: BooleanFromString.default(true),
  ABUSE_DENYLIST_UA: z
    .string()
    .default("")
    .transform((raw) =>
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0),
    ),

  // Rate-limit IP hashing salt — daily-rotated server-side. Set to a stable
  // value if you want cross-day persistence (not recommended), or leave
  // unset to use a randomly-generated per-boot salt.
  RL_IP_SALT: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().optional(),
  ),

  // Wallet-history / Trail feature. Kill switch for the SIWE auth + per-wallet
  // sniff index. When false: /wallet/* endpoints return 503 and /diagnose
  // skips the wallet index write (still returns the paid response).
  WALLET_HISTORY_ENABLED: BooleanFromString.default(true),

  // OpenAI synthesis (Phase 04). Both optional — when OPENAI_API_KEY is unset
  // (or empty, e.g. `OPENAI_API_KEY= pnpm test`), the orchestrator falls
  // through to the template synthesizer (PLAN.md §14 reliability guarantee).
  // Default model honors business-model.md §3 unit economics: gpt-5.4-mini at
  // $0.75/1M input + $4.50/1M output (~$0.003 per /diagnose call, ~2× under
  // the $0.005–$0.020 envelope). gpt-4o-mini remains accepted via
  // OPENAI_MODEL= override (~$0.0004/call) for cost-sensitive deploys.
  OPENAI_API_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).optional(),
  ),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.4-mini"),
  OPENAI_BASE_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().url().optional(),
  ),

  // Phase B — product-context provider (fetch + cheerio + Browserbase fallback).
  // PRODUCT_CONTEXT_ENABLED gates the provider at all; when false the
  // synthesis path skips it and behaves identically to pre-Phase-B.
  //
  // The provider's static path (fetch + cheerio) requires no credentials —
  // it works on any indie-founder marketing site rendered to HTML at request
  // time (Carrd, Webflow SSR, Framer SSR, GitHub Pages, Next.js SSR/SSG,
  // Astro, etc. — roughly 70-80% of indie founder sites).
  //
  // BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID enable the headless
  // fallback for pure-SPA sites that don't serve content statically. Both
  // optional; if either is unset the fallback is silently skipped and the
  // provider returns provenance:"degraded" on a thin static fetch.
  PRODUCT_CONTEXT_ENABLED: BooleanFromString.default(false),
  BROWSERBASE_API_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).optional(),
  ),
  BROWSERBASE_PROJECT_ID: z.preprocess(
    (v) => (typeof v === "string" && v.trim().length === 0 ? undefined : v),
    z.string().min(1).optional(),
  ),
});

type RawEnv = z.infer<typeof EnvSchema>;

export interface Env extends Omit<RawEnv,
  | "SNIFFY_PAYMENT_ASSET_ADDRESS_MAINNET"
  | "SNIFFY_PAYMENT_ASSET_DECIMALS_MAINNET"
  | "SNIFFY_PAYMENT_ASSET_EIP712_NAME_MAINNET"
  | "SNIFFY_PAYMENT_ASSET_EIP712_VERSION_MAINNET"
  | "SNIFFY_PAYMENT_ASSET_ADDRESS_HOODI"
  | "SNIFFY_PAYMENT_ASSET_DECIMALS_HOODI"
  | "SNIFFY_PAYMENT_ASSET_EIP712_NAME_HOODI"
  | "SNIFFY_PAYMENT_ASSET_EIP712_VERSION_HOODI"
> {
  // Resolved active payment asset config — picked per MORPH_NETWORK from the
  // suffixed env vars (or the legacy un-suffixed fallback, or built-in defaults).
  SNIFFY_PAYMENT_ASSET_ADDRESS: string;
  SNIFFY_PAYMENT_ASSET_DECIMALS: number;
  SNIFFY_PAYMENT_ASSET_EIP712_NAME: string;
  SNIFFY_PAYMENT_ASSET_EIP712_VERSION: string;
  RESOURCE_BASE_URL: string;
}

// Built-in per-network defaults — sourced from .env.example.
const ASSET_DEFAULTS = {
  "eip155:2818": {
    address: "0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B", // USDC (Bridged Standard) on Morph Mainnet
    decimals: 6,
    eip712Name: "USDC",
    eip712Version: "2",
  },
  "eip155:2910": {
    address: "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4", // HoodiTestToken
    decimals: 18,
    eip712Name: "HoodiTestToken",
    eip712Version: "1.0",
  },
} as const;

function isOfficialMorphFacilitator(url: string): boolean {
  try {
    return new URL(url).host === "morph-rails.morph.network";
  } catch {
    return false;
  }
}

function resolveActiveAsset(parsed: RawEnv) {
  const network = parsed.MORPH_NETWORK;
  const defaults =
    network === "eip155:2818"
      ? ASSET_DEFAULTS["eip155:2818"]
      : network === "eip155:2910"
        ? ASSET_DEFAULTS["eip155:2910"]
        : ASSET_DEFAULTS["eip155:2818"];

  const suffixed =
    network === "eip155:2818"
      ? {
          address: parsed.SNIFFY_PAYMENT_ASSET_ADDRESS_MAINNET,
          decimals: parsed.SNIFFY_PAYMENT_ASSET_DECIMALS_MAINNET,
          eip712Name: parsed.SNIFFY_PAYMENT_ASSET_EIP712_NAME_MAINNET,
          eip712Version: parsed.SNIFFY_PAYMENT_ASSET_EIP712_VERSION_MAINNET,
        }
      : network === "eip155:2910"
        ? {
            address: parsed.SNIFFY_PAYMENT_ASSET_ADDRESS_HOODI,
            decimals: parsed.SNIFFY_PAYMENT_ASSET_DECIMALS_HOODI,
            eip712Name: parsed.SNIFFY_PAYMENT_ASSET_EIP712_NAME_HOODI,
            eip712Version: parsed.SNIFFY_PAYMENT_ASSET_EIP712_VERSION_HOODI,
          }
        : {};

  // Precedence: suffixed > un-suffixed (legacy) > built-in default.
  return {
    address:
      suffixed.address ?? parsed.SNIFFY_PAYMENT_ASSET_ADDRESS ?? defaults.address,
    decimals:
      suffixed.decimals ??
      parsed.SNIFFY_PAYMENT_ASSET_DECIMALS ??
      defaults.decimals,
    eip712Name:
      suffixed.eip712Name ??
      parsed.SNIFFY_PAYMENT_ASSET_EIP712_NAME ??
      defaults.eip712Name,
    eip712Version:
      suffixed.eip712Version ??
      parsed.SNIFFY_PAYMENT_ASSET_EIP712_VERSION ??
      defaults.eip712Version,
  };
}

function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const parsed = result.data;

  // Phase 3 — when ASA is enabled in production, every credential must be
  // set. Failing at boot beats a runtime error per request.
  if (
    parsed.NODE_ENV === "production" &&
    parsed.APPLE_SEARCH_ADS_ENABLED &&
    (!parsed.APPLE_SEARCH_ADS_CLIENT_ID ||
      !parsed.APPLE_SEARCH_ADS_TEAM_ID ||
      !parsed.APPLE_SEARCH_ADS_KEY_ID ||
      !parsed.APPLE_SEARCH_ADS_PRIVATE_KEY_PEM ||
      !parsed.APPLE_SEARCH_ADS_ORG_ID)
  ) {
    throw new Error(
      "APPLE_SEARCH_ADS_ENABLED=true but one or more required credentials are missing: " +
        "APPLE_SEARCH_ADS_CLIENT_ID, APPLE_SEARCH_ADS_TEAM_ID, APPLE_SEARCH_ADS_KEY_ID, " +
        "APPLE_SEARCH_ADS_PRIVATE_KEY_PEM, APPLE_SEARCH_ADS_ORG_ID. " +
        "Either set all five or flip APPLE_SEARCH_ADS_ENABLED=false.",
    );
  }

  // Phase 4 — history endpoint HMAC must be present in production when
  // rank-history persistence is on. Without it, the /history endpoint
  // can't validate signatures and the SDK can never re-fetch series.
  if (
    parsed.NODE_ENV === "production" &&
    parsed.RANK_HISTORY_ENABLED &&
    !parsed.SNIFFY_HISTORY_HMAC_SECRET
  ) {
    throw new Error(
      "RANK_HISTORY_ENABLED=true but SNIFFY_HISTORY_HMAC_SECRET is unset. " +
        "Generate one with `openssl rand -hex 32` and set it in Railway env, " +
        "or flip RANK_HISTORY_ENABLED=false to disable history persistence.",
    );
  }

  // Phase B — product-context provider doesn't require Browserbase
  // credentials to function (the static fetch + cheerio path works on
  // most indie founder sites without any key). The boot-time guard only
  // fires when Browserbase is partially configured — having one var
  // without the other is always a misconfiguration that would silently
  // skip the fallback even when intended.
  if (
    parsed.NODE_ENV === "production" &&
    parsed.PRODUCT_CONTEXT_ENABLED &&
    Boolean(parsed.BROWSERBASE_API_KEY) !==
      Boolean(parsed.BROWSERBASE_PROJECT_ID)
  ) {
    throw new Error(
      "BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must both be set " +
        "(headless fallback) or both unset (static-only). One without " +
        "the other is a misconfiguration.",
    );
  }

  // Non-fatal heads-up for local dev: Morph's official facilitator at
  // morph-rails.morph.network has been returning HTTP 500 on /v2/verify
  // (both Mainnet and Hoodi) since at least 2026-05-20. With
  // MORPH_FACILITATOR_MODE=morph-official, /diagnose calls will fail at the
  // facilitator boundary until Morph restores service. Flip to
  // fixture-receipt for offline iteration; keep morph-official for the
  // canonical x402 demo path.
  if (
    parsed.NODE_ENV === "development" &&
    parsed.MORPH_FACILITATOR_MODE === "morph-official" &&
    isOfficialMorphFacilitator(parsed.MORPH_FACILITATOR_URL)
  ) {
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        message: "morph_facilitator_outage_advisory",
        facilitatorUrl: parsed.MORPH_FACILITATOR_URL,
        mode: parsed.MORPH_FACILITATOR_MODE,
        advice:
          "Morph's official facilitator is currently degraded. Set MORPH_FACILITATOR_MODE=fixture-receipt for offline dev iteration; keep morph-official for the canonical x402 demo path.",
      })}\n`,
    );
  }

  const asset = resolveActiveAsset(parsed);

  const {
    SNIFFY_PAYMENT_ASSET_ADDRESS_MAINNET: _a,
    SNIFFY_PAYMENT_ASSET_DECIMALS_MAINNET: _b,
    SNIFFY_PAYMENT_ASSET_EIP712_NAME_MAINNET: _c,
    SNIFFY_PAYMENT_ASSET_EIP712_VERSION_MAINNET: _d,
    SNIFFY_PAYMENT_ASSET_ADDRESS_HOODI: _e,
    SNIFFY_PAYMENT_ASSET_DECIMALS_HOODI: _f,
    SNIFFY_PAYMENT_ASSET_EIP712_NAME_HOODI: _g,
    SNIFFY_PAYMENT_ASSET_EIP712_VERSION_HOODI: _h,
    ...rest
  } = parsed;

  return {
    ...rest,
    SNIFFY_PAYMENT_ASSET_ADDRESS: asset.address,
    SNIFFY_PAYMENT_ASSET_DECIMALS: asset.decimals,
    SNIFFY_PAYMENT_ASSET_EIP712_NAME: asset.eip712Name,
    SNIFFY_PAYMENT_ASSET_EIP712_VERSION: asset.eip712Version,
    RESOURCE_BASE_URL:
      parsed.RESOURCE_BASE_URL ?? `http://localhost:${parsed.PORT}`,
  };
}

export const env: Env = loadEnv();

export function loadEnvForTests(overrides: Partial<NodeJS.ProcessEnv> = {}): Env {
  return loadEnv({ ...process.env, ...overrides });
}

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

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  ALLOWED_ORIGINS: CsvOrigins.default(
    "http://localhost:3000,http://localhost:3001",
  ),

  // Morph network + facilitator
  MORPH_NETWORK: CAIP2.default("eip155:2910"),
  MORPH_FACILITATOR_URL: z
    .string()
    .url()
    .default("https://morph-rails.morph.network/x402"),
  MORPH_FACILITATOR_MODE: z
    .enum(["morph-official", "fixture-receipt", "self-hosted-fallback"])
    .default("morph-official"),
  MORPH_FACILITATOR_ACCESS_KEY: z.string().min(1).optional(),
  MORPH_FACILITATOR_SECRET_KEY: z.string().min(1).optional(),

  // Merchant + token config (decision #24 carve-out: optional at boot so
  // `/sample` and `/quote` still serve when no wallet is configured)
  SNIFFY_MERCHANT_ADDRESS: EvmAddress.optional(),
  SNIFFY_PAYMENT_ASSET_ADDRESS: EvmAddress.default(
    "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4",
  ),
  SNIFFY_PAYMENT_ASSET_DECIMALS: z.coerce.number().int().min(0).max(36).default(18),
  SNIFFY_PAYMENT_ASSET_EIP712_NAME: z.string().min(1).default("HoodiTestToken"),
  SNIFFY_PAYMENT_ASSET_EIP712_VERSION: z.string().min(1).default("1.0"),

  RESOURCE_BASE_URL: z.string().url().optional(),

  ENABLE_REQUEST_LOG: BooleanFromString.default(true),

  // Cache: Upstash REST is the production path; in-memory Map fallback when
  // either of these is missing (works for local dev and tests with no infra).
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // Cache TTLs in seconds. Defaults from docs/03-data-providers.md §03.p4.
  CACHE_TTL_APP_METADATA: z.coerce.number().int().positive().default(86400),
  CACHE_TTL_KEYWORD_RANK: z.coerce.number().int().positive().default(21600),
  CACHE_TTL_ANDROID_PREVIEW: z.coerce.number().int().positive().default(43200),
  CACHE_TTL_FULL_REPORT: z.coerce.number().int().positive().default(3600),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const parsed = result.data;
  return {
    ...parsed,
    RESOURCE_BASE_URL:
      parsed.RESOURCE_BASE_URL ?? `http://localhost:${parsed.PORT}`,
  };
}

export const env: Env = loadEnv();

export function loadEnvForTests(overrides: Partial<NodeJS.ProcessEnv> = {}): Env {
  return loadEnv({ ...process.env, ...overrides });
}

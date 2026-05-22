import { createHash } from "node:crypto";
import OpenAI from "openai";
import { env } from "../env.js";
import { getCacheClient } from "../cache/redis.js";
import { getOpenAiClient } from "../synthesis/openai-client.js";

// Phase 9 (Day 5) — Embeddings via OpenAI text-embedding-3-small.
//
// Devsecops review (recap): the original design specified a local
// @xenova/transformers + MiniLM-L6-v2 model. We pivoted to OpenAI's
// hosted text-embedding-3-small because:
//   • Railway 512MB plan + node:22-slim base + ONNX runtime + model
//     weights (~80MB) leaves no headroom for traffic burst, and a single
//     OOMKill mid-/diagnose orphans an x402 receipt on Morph Mainnet
//     (non-refundable).
//   • Local model adds ~3-8s cold-start when Railway scales from zero,
//     a demo-day regression risk.
//   • OpenAI embeddings cost ~$0.0001 per /diagnose — negligible vs the
//     ~$0.003 we already spend on gpt-5.4-mini for synthesis.
//   • The 30-day Redis cache absorbs repeat costs aggressively; embed
//     calls are deterministic per (model, text) so cache hits are exact.
//
// Local model remains a Phase 10 option once we have production traffic
// numbers; until then this module is the relevance gate's similarity
// backbone.

const MODEL = "text-embedding-3-small";
const MODEL_DIM = 1536;
const CACHE_NAMESPACE = "sniffy:emb:oai:v3-small";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_INPUT_CHARS = 200;

export interface EmbedTextOptions {
  client?: OpenAI | null;
}

export interface EmbeddingResult {
  vector: Float32Array;
  fromCache: boolean;
}

export class EmbeddingError extends Error {
  readonly kind: "disabled" | "network_error" | "invalid_input";
  constructor(message: string, kind: EmbeddingError["kind"]) {
    super(message);
    this.name = "EmbeddingError";
    this.kind = kind;
  }
}

// Normalize input: NFKC + trim + lowercase + reject empty / too-long /
// contains non-printable characters. Devsecops requirement: prevents
// cache poisoning from Unicode-variant abuse and bounds the per-call
// embedding payload size.
export function normalizeForEmbedding(input: string): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.normalize("NFKC").trim().toLowerCase();
  if (normalized.length === 0) return null;
  if (normalized.length > MAX_INPUT_CHARS) return null;
  // Disallow non-printable / control chars (keep  -~ + common
  // multilingual ranges via the negated control-char class).
  if (/[\u0000-\u001F\u007F]/.test(normalized)) return null;
  return normalized;
}

export async function embedText(
  text: string,
  options: EmbedTextOptions = {},
): Promise<EmbeddingResult> {
  const normalized = normalizeForEmbedding(text);
  if (normalized === null) {
    throw new EmbeddingError(
      "Input failed normalization (empty, too long, or non-printable)",
      "invalid_input",
    );
  }

  const key = `${CACHE_NAMESPACE}:${sha1(normalized)}`;
  const cache = getCacheClient();
  const cached = await cache.get(key);
  if (cached !== null) {
    try {
      const buf = Buffer.from(cached, "base64");
      const vector = new Float32Array(
        buf.buffer,
        buf.byteOffset,
        buf.byteLength / 4,
      );
      if (vector.length === MODEL_DIM) {
        return { vector: new Float32Array(vector), fromCache: true };
      }
    } catch {
      // Cache poisoned or wrong shape — fall through to live call.
    }
  }

  const client = options.client ?? getOpenAiClient();
  if (!client) {
    throw new EmbeddingError(
      "OPENAI_API_KEY not configured — embedding unavailable",
      "disabled",
    );
  }

  let response: Awaited<ReturnType<typeof client.embeddings.create>>;
  try {
    response = await client.embeddings.create({
      model: MODEL,
      input: normalized,
    });
  } catch (err) {
    throw new EmbeddingError(
      `embedding request failed: ${(err as Error).message}`,
      "network_error",
    );
  }

  const raw = response.data[0]?.embedding;
  if (!raw || raw.length !== MODEL_DIM) {
    throw new EmbeddingError(
      `embedding response shape unexpected (got dim=${raw?.length ?? 0})`,
      "network_error",
    );
  }
  const vector = new Float32Array(raw);

  try {
    const buf = Buffer.from(
      vector.buffer,
      vector.byteOffset,
      vector.byteLength,
    );
    await cache.set(key, buf.toString("base64"), CACHE_TTL_SECONDS);
  } catch {
    // Cache write is best-effort — never block on it.
  }

  return { vector, fromCache: false };
}

// Cosine similarity. Returns 0 when either vector is zero-length / wrong
// dim — never throws so callers can score in batches.
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Composite "target vector" text used by the relevance gate — encodes
// the app name, subtitle, a description excerpt, and primary keywords
// into a single embedding. Bounded by MAX_INPUT_CHARS so unusual
// app descriptions don't blow the budget; truncation favors the most
// search-relevant signal (name + subtitle + keywords) over verbose
// marketing copy.
export function buildTargetVectorText(input: {
  appName: string;
  subtitle?: string | undefined;
  description?: string | undefined;
  primaryKeywords: readonly string[];
}): string {
  const parts: string[] = [];
  parts.push(input.appName);
  if (input.subtitle) parts.push(input.subtitle);
  if (input.primaryKeywords.length > 0) {
    parts.push(input.primaryKeywords.join(" "));
  }
  // Save what's left of the budget for description excerpt.
  const prefix = parts.join(" ");
  const remaining = Math.max(0, MAX_INPUT_CHARS - prefix.length - 1);
  if (input.description && remaining > 20) {
    parts.push(input.description.slice(0, remaining));
  }
  return parts.join(" ").slice(0, MAX_INPUT_CHARS);
}

export function isRelevanceGateEnabled(): boolean {
  return env.RELEVANCE_GATE_ENABLED === true;
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

import { env } from "../env.js";
import type {
  Pricing,
  PricingBreakdownItem,
  SavingsNote,
} from "../schemas/index.js";

function networkSlug(caip2: string): string {
  if (caip2 === "eip155:2818") return "morph-mainnet";
  if (caip2 === "eip155:2910") return "morph-hoodi";
  return caip2;
}

// Hackathon prices in CENTS (docs/business-model.md §2.1). Integer cents keep
// the sum exact — no float drift via parseFloat.
const PRICE_BASE_CENTS = 3n;
const PRICE_PER_KEYWORD_CENTS = 1n;
const PRICE_PER_ADDITIONAL_COUNTRY_CENTS = 1n;
const PRICE_COMPETITOR_SHALLOW_CENTS = 2n;
const PRICE_COMPETITOR_DEEP_CENTS = 5n;

// Sprint A — refresh-sniff discount. When the same (store, country, appId)
// has been diagnosed within the last 30 days, the next /diagnose price drops
// 50%. Implemented as integer ratio to keep cents math exact.
const REFRESH_DISCOUNT_NUMERATOR = 1n;
const REFRESH_DISCOUNT_DENOMINATOR = 2n;

// Sprint A — anonymous comparison reference points. Mirror public pricing
// tiers of mainstream ASO subscription products as of 2026-05. Never names
// a specific competitor. Used to populate the savingsNote on /quote.
export const TYPICAL_ASO_START_MONTHLY_USD = 59;
export const TYPICAL_ASO_START_ANNUAL_USD = 589;
export const TYPICAL_ASO_PRO_MONTHLY_USD = 199;
export const TYPICAL_ASO_PRO_ANNUAL_USD = 1699;

// Sprint A — Sniff Pack tiers. Prepaid bulk credits, not subscriptions:
// founder buys N sniffs up-front and decrements a Redis-tracked balance.
// Avg-per-sniff figures (Pack 10 $0.40 / Pack 50 $0.30 / Pack 250 $0.20)
// stay well above the marginal price of a Quick-tier sniff, so packs are
// a UX shortcut for repeat callers, not a loss leader.
//
// Full purchase + balance-decrement endpoint is scaffolded here and wired
// in a follow-up commit. Defining the tiers in pricing.ts (rather than a
// new module) keeps the price surface in one place and makes pricing
// snapshot tests the single point of truth.
export const SNIFF_PACK_TIERS = [
  {
    id: "sniff-pack-10",
    label: "Sniff Pack 10",
    credits: 10,
    totalCents: 400n,
    avgPerSniffCents: 40n,
    discountPercent: 20,
  },
  {
    id: "sniff-pack-50",
    label: "Sniff Pack 50",
    credits: 50,
    totalCents: 1500n,
    avgPerSniffCents: 30n,
    discountPercent: 40,
  },
  {
    id: "sniff-pack-250",
    label: "Sniff Pack 250",
    credits: 250,
    totalCents: 5000n,
    avgPerSniffCents: 20n,
    discountPercent: 60,
  },
] as const;

export type SniffPackId = (typeof SNIFF_PACK_TIERS)[number]["id"];

export interface SniffPack {
  readonly id: SniffPackId;
  readonly label: string;
  readonly credits: number;
  readonly totalCents: bigint;
  readonly avgPerSniffCents: bigint;
  readonly discountPercent: number;
}

export function getSniffPack(id: SniffPackId): SniffPack | undefined {
  return SNIFF_PACK_TIERS.find((p) => p.id === id);
}

// Public view of a Sniff Pack with formatted USD strings for clients that
// surface prices without doing their own cents math.
export interface SniffPackQuote {
  id: SniffPackId;
  label: string;
  credits: number;
  totalAmount: string;
  avgPerSniffAmount: string;
  discountPercent: number;
}

export function quoteSniffPack(id: SniffPackId): SniffPackQuote | undefined {
  const pack = getSniffPack(id);
  if (!pack) return undefined;
  return {
    id: pack.id,
    label: pack.label,
    credits: pack.credits,
    totalAmount: formatCents(pack.totalCents),
    avgPerSniffAmount: formatCents(pack.avgPerSniffCents),
    discountPercent: pack.discountPercent,
  };
}

export function listSniffPackQuotes(): SniffPackQuote[] {
  return SNIFF_PACK_TIERS.map((p) => ({
    id: p.id,
    label: p.label,
    credits: p.credits,
    totalAmount: formatCents(p.totalCents),
    avgPerSniffAmount: formatCents(p.avgPerSniffCents),
    discountPercent: p.discountPercent,
  }));
}

export type CompetitorDepth = "shallow" | "deep";

export interface ComputePricingInput {
  keywords: readonly string[];
  countries?: readonly string[];
  competitorDepth?: CompetitorDepth;
  currency?: string;
  network?: string;
  // Sprint A — when true, the breakdown sum is halved and the savings are
  // surfaced as a positive-amount line item under pricing.discounts. Set by
  // the route layer when it observes a recent /diagnose for the same tuple.
  refreshDiscount?: boolean;
}

// Format an integer cents value as a fixed-2-decimal string ("50" -> "0.50").
// Avoids Number arithmetic entirely to keep amounts byte-stable.
function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const dollars = abs / 100n;
  const remainder = abs % 100n;
  const remainderStr = remainder.toString().padStart(2, "0");
  return `${negative ? "-" : ""}${dollars.toString()}.${remainderStr}`;
}

export function computePricing(input: ComputePricingInput): Pricing {
  const keywordCount = BigInt(input.keywords.length);
  const countries = input.countries ?? [];
  const additionalCountries = countries.length > 1 ? BigInt(countries.length - 1) : 0n;

  const breakdown: PricingBreakdownItem[] = [
    { label: "base diagnosis", amount: formatCents(PRICE_BASE_CENTS) },
  ];

  if (keywordCount > 0n) {
    const keywordCents = keywordCount * PRICE_PER_KEYWORD_CENTS;
    breakdown.push({
      label: `${keywordCount.toString()} keywords`,
      amount: formatCents(keywordCents),
    });
  }

  if (additionalCountries > 0n) {
    const countryCents = additionalCountries * PRICE_PER_ADDITIONAL_COUNTRY_CENTS;
    breakdown.push({
      label: `${additionalCountries.toString()} additional countries`,
      amount: formatCents(countryCents),
    });
  }

  if (input.competitorDepth === "shallow") {
    breakdown.push({
      label: "competitor trail (shallow)",
      amount: formatCents(PRICE_COMPETITOR_SHALLOW_CENTS),
    });
  } else if (input.competitorDepth === "deep") {
    breakdown.push({
      label: "competitor trail (deep)",
      amount: formatCents(PRICE_COMPETITOR_DEEP_CENTS),
    });
  }

  // Re-sum from the strings so the on-the-wire amount and the breakdown
  // never disagree. parseFloat would risk 0.1+0.2 drift; we go through cents.
  let grossCents = 0n;
  for (const item of breakdown) {
    grossCents += parseCents(item.amount);
  }

  const discounts: PricingBreakdownItem[] = [];
  let netCents = grossCents;

  if (input.refreshDiscount) {
    // Integer cents math. Floor division falls naturally out of bigint /.
    const discountCents =
      (grossCents * REFRESH_DISCOUNT_NUMERATOR) / REFRESH_DISCOUNT_DENOMINATOR;
    if (discountCents > 0n) {
      discounts.push({
        label: "refresh-sniff (50% off, within 30 days)",
        amount: formatCents(discountCents),
      });
      netCents = grossCents - discountCents;
    }
  }

  return {
    currency: input.currency ?? "USDC",
    network: input.network ?? networkSlug(env.MORPH_NETWORK),
    estimatedTotal: formatCents(netCents),
    breakdown,
    discounts,
  };
}

// Build the anonymous savings comparison surfaced on every /quote response.
// Numbers are public reference points for mainstream ASO subscriptions and
// never name a specific competitor — the comparison is value-framing, not
// attack copy. Same shape across SDK, CLI, MCP, landing — agents and the UI
// read from this one function.
export function buildSavingsNote(estimatedTotal: string): SavingsNote {
  return {
    message:
      `This sniff: $${estimatedTotal} USDC. Typical ASO subscription: ` +
      `$${TYPICAL_ASO_START_MONTHLY_USD}/month ` +
      `(or $${TYPICAL_ASO_START_ANNUAL_USD}/year). Pay only when you sniff — ` +
      `no subscription, no seats, no card on file.`,
    estimatedSniffCost: estimatedTotal,
    typicalSubscriptionMonthlyUSD: TYPICAL_ASO_START_MONTHLY_USD,
    typicalSubscriptionAnnualUSD: TYPICAL_ASO_START_ANNUAL_USD,
  };
}

function parseCents(amount: string): bigint {
  // amount matches /^\d+(\.\d+)?$/ (PricingBreakdownItem schema enforces it).
  // Convert to integer cents without using float math.
  const [dollarsPart, fractionPart = ""] = amount.split(".");
  const dollarsCents = BigInt(dollarsPart ?? "0") * 100n;
  if (fractionPart.length === 0) return dollarsCents;
  // Take exactly two fractional digits (right-pad with 0, truncate beyond).
  const padded = (fractionPart + "00").slice(0, 2);
  return dollarsCents + BigInt(padded);
}

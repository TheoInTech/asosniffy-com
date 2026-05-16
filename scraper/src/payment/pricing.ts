import type { Pricing, PricingBreakdownItem } from "../schemas/index.js";

// Hackathon prices in CENTS (docs/business-model.md §2.1). Integer cents keep
// the sum exact — no float drift via parseFloat.
const PRICE_BASE_CENTS = 3n;
const PRICE_PER_KEYWORD_CENTS = 1n;
const PRICE_PER_ADDITIONAL_COUNTRY_CENTS = 1n;
const PRICE_COMPETITOR_SHALLOW_CENTS = 2n;
const PRICE_COMPETITOR_DEEP_CENTS = 5n;

export type CompetitorDepth = "shallow" | "deep";

export interface ComputePricingInput {
  keywords: readonly string[];
  countries?: readonly string[];
  competitorDepth?: CompetitorDepth;
  currency?: string;
  network?: string;
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
  let totalCents = 0n;
  for (const item of breakdown) {
    totalCents += parseCents(item.amount);
  }

  return {
    currency: input.currency ?? "USDC",
    network: input.network ?? "morph-hoodi",
    estimatedTotal: formatCents(totalCents),
    breakdown,
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

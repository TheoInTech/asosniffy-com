import { env } from "../env.js";
import type {
  Addons,
  DiagnoseTier,
  PricingBreakdownItem,
} from "../schemas/index.js";

// Cost-aware pricing — the single source of truth that maps premium
// capabilities to their COST and their PRICE.
//
// Why this exists: x402 is pay-first. The price is locked into the 402 offer
// BEFORE the report runs, so what the orchestrator RUNS must equal what the
// price PAID FOR — otherwise a cheap call silently incurs expensive COGS
// (the inversion: a $0.04 call running a $0.18 vision pass). Both
// payment/pricing.ts (the price) and orchestrator/index.ts (the run) call
// `resolvePaidFeatures` so they can never disagree.
//
// Margin policy: every à-la-carte add-on prices its CAPPED worst-case COGS at
// or under 30% of the line (~70% gross margin). The caps elsewhere
// (vision image count, localization storefront count) are what make the
// "capped worst-case" honest — without them the projection is a lie.

export type PremiumFeature =
  | "aiSynthesis"
  | "aiVisibility"
  | "localizationCopy"
  | "creativeVision";

export const ALL_FEATURES: readonly PremiumFeature[] = [
  "aiSynthesis",
  "aiVisibility",
  "localizationCopy",
  "creativeVision",
];

export const MARGIN_COGS_FRACTION = 0.3;

export interface FeatureSpec {
  // Names the capability in pricing.breakdown so an agent sees what it buys.
  label: string;
  // Capped worst-case third-party API cost, in cents. Measured/derived:
  // synthesis ~$0.02, probe ~$0.0066 (≤3¢ with headroom for multi-model),
  // localization capped at 10 storefronts (~5¢), vision capped at ≤8
  // low-detail images on the cheap model (~5¢, re-measured before flag flip).
  projectedCogsCents: number;
  // Add-on line price in cents (0 = bundled-only, never sold à la carte).
  // = roundUpTo5(ceil(projectedCogsCents / MARGIN_COGS_FRACTION)).
  addonPriceCents: number;
  // Tiers whose BASE price already bundles this feature (no separate line).
  defaultTiers: readonly DiagnoseTier[];
}

function addonPriceFor(projectedCogsCents: number): number {
  const minPrice = Math.ceil(projectedCogsCents / MARGIN_COGS_FRACTION);
  return Math.ceil(minPrice / 5) * 5; // round up to a clean nickel
}

export const PREMIUM_FEATURES: Record<PremiumFeature, FeatureSpec> = {
  // Bundled into the standard/expert base; quick uses deterministic template
  // synthesis (0 COGS). Never à la carte → addonPriceCents 0.
  aiSynthesis: {
    label: "AI synthesis (recommendations + ready-to-paste)",
    projectedCogsCents: 2,
    addonPriceCents: 0,
    defaultTiers: ["standard", "expert"],
  },
  aiVisibility: {
    label: "AI visibility probe (LLM share-of-voice)",
    projectedCogsCents: 3,
    addonPriceCents: addonPriceFor(3), // ceil(3/0.3)=10 → 10¢
    defaultTiers: ["standard", "expert"],
  },
  localizationCopy: {
    label: "localized copy generation",
    projectedCogsCents: 5,
    addonPriceCents: addonPriceFor(5), // ceil(5/0.3)=17 → 20¢
    defaultTiers: ["expert"],
  },
  creativeVision: {
    label: "creative screenshot audit (vision)",
    projectedCogsCents: 5,
    addonPriceCents: addonPriceFor(5), // ceil(5/0.3)=17 → 20¢
    defaultTiers: ["expert"],
  },
};

// The à-la-carte keys (mirror schemas Addons). aiSynthesis is excluded — it's
// bundled-only and not in the Addons schema.
const ADDON_KEYS: readonly (keyof Addons)[] = [
  "aiVisibility",
  "creativeVision",
  "localizationCopy",
];

export interface EnabledFlags {
  llmProbeEnabled: boolean;
  localizationEnabled: boolean;
  visionEnabled: boolean;
}

// Build the globally-enabled feature set from env kill-switches. aiSynthesis
// is always enabled (it self-falls-back to template synthesis when no OpenAI
// client exists, at 0 COGS) so it never needs a flag.
export function enabledFeaturesFrom(flags: EnabledFlags): Set<PremiumFeature> {
  const enabled = new Set<PremiumFeature>(["aiSynthesis"]);
  if (flags.llmProbeEnabled) enabled.add("aiVisibility");
  if (flags.localizationEnabled) enabled.add("localizationCopy");
  if (flags.visionEnabled) enabled.add("creativeVision");
  return enabled;
}

// The env-backed enabled set. ONE call site for both pricing (the routes) and
// gating (the orchestrator) so they can never read different flags — the
// pay-first invariant that price == what runs.
export function currentEnabledFeatures(): Set<PremiumFeature> {
  return enabledFeaturesFrom({
    llmProbeEnabled: env.LLM_PROBE_ENABLED,
    localizationEnabled: env.LOCALIZATION_ENABLED,
    visionEnabled: env.VISION_CREATIVE_ENABLED,
  });
}

// THE resolver. (tier defaults ∪ requested add-ons) ∩ globally-enabled.
// Tier MUST be normalized (no undefined) before this is called — the routes
// map a missing tier to "standard".
export function resolvePaidFeatures(
  tier: DiagnoseTier,
  addons: Addons | undefined,
  enabled: ReadonlySet<PremiumFeature>,
): Set<PremiumFeature> {
  const result = new Set<PremiumFeature>();
  for (const feature of ALL_FEATURES) {
    if (!enabled.has(feature)) continue; // disabled → never priced, never run
    const bundled = PREMIUM_FEATURES[feature].defaultTiers.includes(tier);
    const requested =
      (ADDON_KEYS as readonly string[]).includes(feature) &&
      addons?.[feature as keyof Addons] === true;
    if (bundled || requested) result.add(feature);
  }
  return result;
}

export function projectedCogsCentsFor(
  features: ReadonlySet<PremiumFeature>,
): number {
  let total = 0;
  for (const f of features) total += PREMIUM_FEATURES[f].projectedCogsCents;
  return total;
}

function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${remainder.toString().padStart(2, "0")}`;
}

// The priced breakdown lines for à-la-carte add-ons BEYOND what the tier
// already bundles. A bundled feature shows up in the base price, not here.
export function featureLineItems(
  tier: DiagnoseTier,
  addons: Addons | undefined,
  enabled: ReadonlySet<PremiumFeature>,
): PricingBreakdownItem[] {
  const items: PricingBreakdownItem[] = [];
  for (const feature of ADDON_KEYS) {
    const spec = PREMIUM_FEATURES[feature];
    const bundled = spec.defaultTiers.includes(tier);
    const requested = addons?.[feature] === true;
    if (requested && !bundled && enabled.has(feature) && spec.addonPriceCents > 0) {
      items.push({
        label: spec.label,
        amount: formatCents(spec.addonPriceCents),
      });
    }
  }
  return items;
}

// The COGS budget for a request = Σ projected COGS of its paid features. The
// gate (used in the orchestrator) refuses to run a section that wasn't paid
// for, and brakes if an earlier section's ACTUAL cost overran its projection.
export interface CogsGate {
  allow(feature: PremiumFeature): boolean;
  readonly budgetCents: number;
}

export function makeCogsGate(opts: {
  paidFeatures: ReadonlySet<PremiumFeature>;
  budgetCents: number;
}): CogsGate {
  let reservedCents = 0;
  return {
    budgetCents: opts.budgetCents,
    allow(feature: PremiumFeature): boolean {
      if (!opts.paidFeatures.has(feature)) return false; // belt: not paid for
      const projected = PREMIUM_FEATURES[feature].projectedCogsCents;
      if (reservedCents + projected > opts.budgetCents) return false; // brake
      reservedCents += projected; // reserve atomically (sync) for parallel sections
      return true;
    },
  };
}

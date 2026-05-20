import Image from "next/image";
import type { CoverageProviderError } from "@sniffy/scraper/schemas";
import type { NoScentReason } from "./triggers";

const COPY: Record<
  NoScentReason,
  { title: string; description: string; suggestions: string[] }
> = {
  "app-not-found": {
    title: "Sniffy couldn't pin down this app",
    description:
      "We tried the App Store and Google Play but couldn't lock onto an exact match.",
    suggestions: [
      "Paste the full App Store URL (the one starting with apps.apple.com).",
      "Try the numeric App Store ID directly.",
      "Double-check the spelling of the app name.",
    ],
  },
  "all-keywords-missing": {
    title: "The trail goes cold on these keywords",
    description:
      "None of the keywords you gave us reach into the iOS ranks for this app right now.",
    suggestions: [
      "Broaden the keyword — try the parent category term.",
      "Mix in a few competitor brand keywords.",
      "Try a different country — rankings vary across stores.",
    ],
  },
  "country-unsupported": {
    title: "We don't have a stable trail for that country yet",
    description:
      "Provider coverage for this country is too thin for Sniffy to give a reliable read.",
    suggestions: [
      "Switch to US, GB, CA, AU, DE, FR, JP, BR, IN, or PH for the demo.",
      "Run the sniff in your closest supported market for a directional read.",
    ],
  },
  "all-fixture": {
    title: "Live providers were unreachable",
    description:
      "Every upstream provider fell back to fixture data on this run, so Sniffy can't promise a real-time read.",
    suggestions: [
      "Retry in a minute — providers usually recover quickly.",
      "Try a known major app (Duolingo, Headspace) to verify the demo is healthy.",
      "Use the free sample report for a fully populated example.",
    ],
  },
  "coverage-degraded": {
    title: "Sniffy hit a provider snag mid-trail",
    description:
      "Every live provider returned an error on this run. Sniffy will never substitute fake data — the rows are intentionally empty until they recover.",
    suggestions: [
      "Retry in 30–60 seconds — most provider errors clear quickly.",
      "Check status.sniffy.io for a known incident.",
      "Try a different country to confirm whether the issue is region-specific.",
    ],
  },
};

interface Props {
  reason: NoScentReason;
  recommendations?: string[];
  // Phase 1 — when reason === "coverage-degraded", render the actual
  // provider error reasons (kind + message) so users see "Apple rate-
  // limited /lookup" instead of the generic copy alone.
  providerErrors?: readonly CoverageProviderError[];
  onReset?: () => void;
}

export function NoScent({
  reason,
  recommendations,
  providerErrors,
  onReset,
}: Props) {
  const copy = COPY[reason];
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex flex-col items-start gap-4 md:flex-row">
        <Image
          src="/sniffy/puzzled.png"
          alt="Sniffy looking puzzled at a broken scent trail"
          width={120}
          height={120}
          priority={false}
        />
        <div className="flex-1">
          <h2 className="font-display text-lg font-semibold uppercase tracking-[0.12em] text-sniffy-ink">
            {copy.title}
          </h2>
          <p className="mt-1 font-mono text-sm text-sniffy-ink-2">
            {copy.description}
          </p>
          <p className="mt-3 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            Try this
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 font-mono text-xs text-sniffy-ink-2">
            {(recommendations && recommendations.length > 0
              ? recommendations
              : copy.suggestions
            ).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {reason === "coverage-degraded" &&
          providerErrors &&
          providerErrors.length > 0 ? (
            <div className="mt-4 border-2 border-sniffy-warn bg-sniffy-paper-2 px-3 py-2 font-mono text-xs">
              <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-warn">
                Provider errors observed
              </p>
              <ul className="mt-1 space-y-1 text-sniffy-ink-2">
                {providerErrors.slice(0, 5).map((e, idx) => (
                  <li key={`${e.provider}-${idx}`}>
                    <span className="font-semibold text-sniffy-ink">
                      {e.provider}
                    </span>{" "}
                    <span className="text-sniffy-ink-mute">({e.kind})</span>{" "}
                    {e.message}
                    {e.retryAfterSec !== undefined ? (
                      <span className="text-sniffy-ink-mute">
                        {" "}
                        · retry in {e.retryAfterSec}s
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="mt-4 inline-flex items-center border-2 border-sniffy-ink bg-sniffy-paper px-4 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.14em] hover:bg-sniffy-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
            >
              Adjust the sniff
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

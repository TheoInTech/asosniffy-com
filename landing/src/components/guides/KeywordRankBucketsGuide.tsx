import Link from "next/link";

export function KeywordRankBucketsGuide() {
  return (
    <div className="space-y-6 text-sm text-sniffy-ink-mute">
      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          Why ranks are bucketed, not point-by-point
        </h2>
        <p className="mt-2">
          App Store search rank is fluid &mdash; an app sitting at position 12
          for &quot;habit tracker&quot; on Tuesday can land at 18 by Friday
          based on competitor releases, ratings volume, or seasonal query
          shifts. Reporting an exact rank as a single number invites false
          precision; reporting a bucket forces you to think in actionable
          tiers instead.
        </p>
        <p className="mt-2">
          Sniffy buckets every diagnosed keyword into one of five tiers:{" "}
          <span className="font-mono">1-10</span>,{" "}
          <span className="font-mono">11-30</span>,{" "}
          <span className="font-mono">31-50</span>,{" "}
          <span className="font-mono">51-100</span>, and{" "}
          <span className="font-mono">not_found</span>. Each bucket implies a
          different decision.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          What each bucket means in practice
        </h2>
        <ul className="mt-2 space-y-3">
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              1&ndash;10
            </span>{" "}
            &mdash; the top of the first results screen. The vast majority of
            App Store installs come from these positions. Defend
            aggressively: monitor for competitor releases, refresh promotional
            text on launches, and keep ratings velocity up.
          </li>
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              11&ndash;30
            </span>{" "}
            &mdash; the top of the &quot;more results&quot; screen, where
            engaged searchers actually scroll. This is the most actionable
            bucket: small placement changes (subtitle rewrite, keyword
            consolidation) can promote keywords here into the top 10. If
            Sniffy flags a high-intent term in 11&ndash;30 with low minimum
            difficulty, that&apos;s your fastest unlock.
          </li>
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              31&ndash;50
            </span>{" "}
            &mdash; below the fold for most searchers. Worth working toward
            only if the keyword has high intent and your metadata is the
            obvious blocker. Otherwise, deprioritize.
          </li>
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              51&ndash;100
            </span>{" "}
            &mdash; effectively invisible. The decision is not &quot;how do I
            move this up&quot; but &quot;is this keyword worth targeting at
            all?&quot; If intent and search volume justify the slot, treat it
            as a long-term keyword and pair with description copy on Android.
            If not, free the slot for a higher-leverage term.
          </li>
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              not_found
            </span>{" "}
            &mdash; outside the top 100, or Apple isn&apos;t indexing your
            app for this query at all. Often a sign that the keyword is not
            in any indexed field (title, subtitle, keyword field) or that
            you&apos;ve been flagged for a guideline violation (competitor
            brand names, &quot;free&quot;, your own category).
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          Difficulty vs. rank: two numbers, two decisions
        </h2>
        <p className="mt-2">
          Bucket tells you{" "}
          <em>where you are now</em>. Difficulty (and{" "}
          <span className="font-mono">minDifficulty</span>) tells you{" "}
          <em>how hard moving up will be</em>. A keyword at rank 11&ndash;30
          with difficulty 71/100 (high) means the placement is good but the
          contest is fierce &mdash; expect to need ratings velocity, not just
          a subtitle edit. The same bucket with difficulty 38/100 (low) means
          a structural fix likely promotes the keyword on its own.
        </p>
        <p className="mt-2">
          Sniffy reports both numbers per keyword so you can prioritize by
          impact-over-effort rather than by rank alone.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          How Sniffy measures this
        </h2>
        <p className="mt-2">
          Every paid Sniffy report&apos;s{" "}
          <span className="font-mono">keywordDiagnosis[]</span> array carries
          a <span className="font-mono">rankBucket</span> per keyword, plus{" "}
          <span className="font-mono">difficulty</span>,{" "}
          <span className="font-mono">minDifficulty</span>,{" "}
          <span className="font-mono">intentScore</span>, and a{" "}
          <span className="font-mono">recommendation</span> string that
          explains the most leveraged next move for that keyword. The{" "}
          <Link
            href="/sample"
            className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
          >
            sample report
          </Link>{" "}
          shows the per-keyword diagnosis for a habit-tracker app with two
          keywords in different buckets.
        </p>
      </section>
    </div>
  );
}

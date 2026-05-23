import Link from "next/link";

export function CompetitorKeywordOverlapGuide() {
  return (
    <div className="space-y-6 text-sm text-sniffy-ink-mute">
      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          The competitor isn&apos;t the app you fear &mdash; it&apos;s the app outranking you
        </h2>
        <p className="mt-2">
          Founders tend to define competitors by feature parity. The App
          Store doesn&apos;t care. Two apps with overlapping feature sets but
          no shared ranking keywords are not competing in any meaningful ASO
          sense. The competitor that matters is the one ranking above you on
          a keyword you both target &mdash; because that&apos;s the impression
          you are losing.
        </p>
        <p className="mt-2">
          The right starting question is: <em>for each keyword I care about,
          who ranks higher than me and why?</em>
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          Reading a competitor trail
        </h2>
        <p className="mt-2">
          A Sniffy report&apos;s{" "}
          <span className="font-mono">competitorTrail[]</span> lists, for each
          target keyword, the top-ranking apps that overlap with yours,
          together with{" "}
          <span className="font-mono">overlapKeywords</span> (the keywords you
          and the competitor both target) and a short note on the structural
          reason they outrank you.
        </p>
        <p className="mt-2">
          In the sample report, &quot;Streakly&quot; outranks the target app
          on both shared keywords because{" "}
          <span className="font-mono">habit tracker</span> sits in
          Streakly&apos;s subtitle &mdash; the highest-weight indexed field
          short of the title &mdash; while the target app buries the same
          phrase in the keyword field. Same keyword, different placement,
          different rank. A second competitor, &quot;RoutineLab&quot;, ranks
          lower on volume but holds on with a tighter keyword field: three
          high-intent terms, no filler.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          Three patterns that explain most overlap losses
        </h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            <span className="font-semibold text-sniffy-ink">
              Wrong-field placement.
            </span>{" "}
            Same keyword, theirs in the subtitle, yours in the keyword
            field. The fix is a subtitle rewrite, not a new keyword. See the{" "}
            <Link
              href="/guides/ios-subtitle-strategy"
              className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
            >
              subtitle guide
            </Link>{" "}
            for the placement hierarchy.
          </li>
          <li>
            <span className="font-semibold text-sniffy-ink">
              Ratings drag.
            </span>{" "}
            Apple weights average star rating and review volume into ranking.
            A 4.5&star; competitor with 5,000 ratings will outrank you on
            marginal keyword matches even when your metadata is cleaner. The
            fix is in-product (post-NPS prompt), not in metadata.
          </li>
          <li>
            <span className="font-semibold text-sniffy-ink">
              Phrase fragmentation.
            </span>{" "}
            Apple&apos;s ranker prefers exact-phrase matches. If a competitor
            has &quot;habit tracker&quot; as a contiguous phrase and you have
            &quot;habit&quot; and &quot;tracker&quot; in separate fields, the
            competitor wins on the most-searched query. The fix is to
            consolidate.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          What the overlap doesn&apos;t tell you
        </h2>
        <p className="mt-2">
          The competitor trail tells you{" "}
          <em>where you are losing impressions</em>. It does not tell you
          whether those impressions convert. A high-rank, low-conversion
          keyword can be worse for your business than a mid-rank,
          high-conversion one. Use the trail to choose keywords to defend, and
          use your own install data to choose keywords to abandon.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          How Sniffy measures this
        </h2>
        <p className="mt-2">
          Every paid Sniffy report includes a competitor trail keyed by your
          chosen keywords. Each entry carries{" "}
          <span className="font-mono">overlapKeywords</span>, a structural
          note on why the competitor ranks higher, and a provenance tag (
          <span className="font-mono">live</span>,{" "}
          <span className="font-mono">cached</span>,{" "}
          <span className="font-mono">fixture</span>, or{" "}
          <span className="font-mono">inferred</span>) so you can distinguish
          fresh observations from cached snapshots. The{" "}
          <Link
            href="/sample"
            className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
          >
            sample report
          </Link>{" "}
          shows a two-competitor trail with placement and ratings analysis.
        </p>
      </section>
    </div>
  );
}

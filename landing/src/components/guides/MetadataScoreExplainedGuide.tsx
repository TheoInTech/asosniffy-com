import Link from "next/link";

export function MetadataScoreExplainedGuide() {
  return (
    <div className="space-y-6 text-sm text-sniffy-ink-mute">
      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          A score, not a verdict
        </h2>
        <p className="mt-2">
          Sniffy assigns every app a 0&ndash;100 metadata score across six
          weighted components. It is a diagnostic, not a verdict: a 63/100
          tells you{" "}
          <em>where</em> your ASO health is weakest, not that your app is
          63% as good as it could be. The point of the breakdown is to make
          it obvious which lever to pull first.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          The six components and what they actually measure
        </h2>
        <ul className="mt-2 space-y-3">
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              title &middot; 20%
            </span>
            <p className="mt-1">
              Penalizes unused character budget, missing category keyword, or
              brand-only titles. A &quot;Pawprint Habits&quot; title scores
              well on brand recall but loses points for carrying no category
              keyword &mdash; Apple weights titles more than any other field.
            </p>
          </li>
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              subtitle &middot; 15%
            </span>
            <p className="mt-1">
              Looks at whether the subtitle carries a high-intent keyword as
              an exact phrase, whether it overlaps with title tokens (waste),
              and whether it stays under the 30-char cap.
            </p>
          </li>
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              keywords &middot; 20%
            </span>
            <p className="mt-1">
              Penalizes redundancy (tokens already in title/subtitle),
              format errors (spaces after commas burn bytes), plural forms
              (Apple stems them automatically), and forbidden terms (your own
              app name, your category, competitor brands per App Store
              Review §5.2).
            </p>
          </li>
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              screenshots &middot; 10%
            </span>
            <p className="mt-1">
              A description-density proxy. Apple&apos;s semantic search reads
              text rendered inside the first three screenshots, but Sniffy
              does not extract caption text directly &mdash; this score is an
              indirect signal you should verify by hand.
            </p>
          </li>
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              ratingsAndReviews &middot; 15%
            </span>
            <p className="mt-1">
              Average star rating and review volume. Apple weights both into
              ranking; a high-rating app surfaces higher on marginal keyword
              matches. The weight is intentionally bounded so a low-volume
              app with great metadata can still post a competitive score.
            </p>
          </li>
          <li>
            <span className="font-mono font-semibold text-sniffy-ink">
              keywordRankings &middot; 20%
            </span>
            <p className="mt-1">
              A direct readout of your current rank distribution: how many
              keywords sit in 1&ndash;10, 11&ndash;30, 31&ndash;50, 51+, or
              are unranked. Tied with title as the heaviest weight &mdash;
              outcomes matter more than form.
            </p>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          How to read the breakdown
        </h2>
        <p className="mt-2">
          The overall number is the headline; the per-component sub-scores
          are the actionable part. A 63/100 that splits into title&nbsp;70
          / subtitle&nbsp;55 / keywords&nbsp;48 / screenshots&nbsp;72 /
          ratings&nbsp;80 / rankings&nbsp;60 is telling you three things at
          once: your brand-side metadata is fine, your discovery-side fields
          (subtitle and keywords) are leaking the most weight, and your
          social proof is doing real work.
        </p>
        <p className="mt-2">
          Pair the score with the report&apos;s top-three{" "}
          <span className="font-mono">recommendations[]</span> &mdash; those
          are ranked by impact-over-effort, and they typically attack the
          two lowest-scoring components first.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          What the score deliberately doesn&apos;t include
        </h2>
        <p className="mt-2">
          Description is not scored on iOS &mdash; Apple does not index it
          for search, so the score weights it at zero (it shows up under
          screenshots only as conversion context). Localization is not
          scored in the overall &mdash; we surface a separate localization
          gap analysis instead, because mixing locales into a single number
          obscures which storefront actually needs work. Promotional text is
          not scored &mdash; it&apos;s a refresh channel, not a ranking
          channel.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          How Sniffy measures this
        </h2>
        <p className="mt-2">
          The{" "}
          <Link
            href="/sample"
            className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
          >
            sample report
          </Link>{" "}
          shows the full metadata score block, including per-component notes
          that explain why each sub-score landed where it did. The{" "}
          <span className="font-mono">weights</span> object is returned in
          every report response so SDK consumers can build their own
          breakdown views.
        </p>
      </section>
    </div>
  );
}

import Link from "next/link";

export function IosSubtitleStrategyGuide() {
  return (
    <div className="space-y-6 text-sm text-sniffy-ink-mute">
      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          A 30-character field that punches above its weight
        </h2>
        <p className="mt-2">
          Apple indexes three text fields for App Store search ranking: the
          title (30 chars), the subtitle (30 chars), and the keyword field
          (100 chars). The description is{" "}
          <span className="font-mono">not</span> indexed on iOS &mdash; it is
          conversion copy that loads after Apple has already decided your
          rank. That leaves you a 160-character budget for ranking, and the
          subtitle is the only one of those three fields the user actually
          reads above the fold.
        </p>
        <p className="mt-2">
          Apple Search Ads documentation describes the title as the
          highest-weighted ranking signal. A primary keyword in the title can
          shift a listing&apos;s rank by roughly 10%. But the title is also
          where your brand has to live. The subtitle is where the next-most
          weighted keyword should go &mdash; and unlike the title, it&apos;s
          easy to edit between releases.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          The token-counted-once rule
        </h2>
        <p className="mt-2">
          Apple indexes the title, subtitle, and keyword field together and
          counts each token{" "}
          <span className="font-semibold text-sniffy-ink">once</span>.
          Repeating a keyword across two of these fields does not double the
          ranking weight &mdash; it wastes characters that could carry another
          term. In a sample Sniffy report, a productivity app spent two of its
          ten keyword-field slots on tokens already present in the subtitle,
          dragging its keyword sub-score from 70 down to 48.
        </p>
        <p className="mt-2">
          The fix is mechanical: list each ranking term in exactly one place,
          and pick the place that maximizes both ranking weight (title &gt;
          subtitle &gt; keyword field) and user-visible intent (subtitle is
          the only one users read).
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          What to put in the subtitle
        </h2>
        <p className="mt-2">
          The subtitle should carry the highest-intent keyword that does not
          fit naturally into the title. &quot;Highest intent&quot; means the
          keyword is the actual query users type when they want the thing
          your app does. For a habit-tracking app, that is{" "}
          <span className="font-mono">habit tracker</span> &mdash; not{" "}
          <span className="font-mono">daily routine</span>, which has lower
          search volume and broader intent.
        </p>
        <p className="mt-2">
          Apple&apos;s ranker prefers exact-phrase matches over scattered
          tokens. <span className="font-mono">&quot;habit tracker&quot;</span>{" "}
          as a contiguous phrase in the subtitle ranks higher than the same
          two words split across title and keyword field. If your subtitle is
          currently a marketing phrase like &quot;Track your daily routine&quot;,
          you are spending a contiguous-phrase slot on a low-intent term.
        </p>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-sniffy-ink">
          How Sniffy measures this
        </h2>
        <p className="mt-2">
          Every paid Sniffy report includes a{" "}
          <span className="font-mono">readyToPaste.subtitle</span> field with
          a recommended rewrite and a{" "}
          <span className="font-mono">changeReason</span> explaining which
          keyword is being promoted and why. The recommendation is grounded
          in the report&apos;s{" "}
          <span className="font-mono">keywordDiagnosis[]</span> &mdash; we
          look at which terms are ranking 11&ndash;30 (worth pushing up) and
          which terms are unindexed but high-intent, then suggest a subtitle
          that surfaces one of them as an exact phrase.
        </p>
        <p className="mt-2">
          The{" "}
          <Link
            href="/sample"
            className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
          >
            sample report
          </Link>{" "}
          shows the full output for a fictional habit-tracker app, including
          a flagged 4-character overage on a candidate subtitle &mdash; one
          of the things Sniffy will tell you that a hand audit usually misses.
        </p>
      </section>
    </div>
  );
}

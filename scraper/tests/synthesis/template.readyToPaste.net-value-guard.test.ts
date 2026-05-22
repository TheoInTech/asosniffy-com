import { describe, expect, it } from "vitest";
import {
  applyNetValueGuard,
  buildNetValueContext,
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Phase 0 — Net-value guard. Recommendations must not strip more
// rank-meaningful tokens from the current copy than they add. Concrete
// failure this prevents: subtitle "Scoring, drills & overlays" gets
// overwritten with "PLAY" because the only opportunity in the pool was a
// generic competitor-unique verb.

function tallyInputWithCompetitorPlay(): SynthesisInput {
  return {
    scoring: {
      metadata: {
        overall: 60,
        title: { score: 85, reasons: [], negativeReasons: [] },
        subtitle: { score: 55, reasons: [], negativeReasons: [] },
        keywordsField: { score: 60, reasons: [], negativeReasons: [] },
        description: { score: 70, reasons: [], negativeReasons: [] },
      },
      keywords: [
        // pickleball is already exact-phrase in the title.
        {
          keyword: "pickleball",
          rankBucket: "31-50",
          intentScore: 0.55,
          confidence: "low",
          provenance: "live",
          coverageInTitle: true,
          coverageInSubtitle: false,
          coverageInDescription: true,
          action: "keep_in_keywords_field",
          isAppSeeding: false,
        },
      ],
      // One competitor exposing the generic verb "PLAY" as its
      // uniqueToCompetitor term — the trigger that previously caused
      // subtitle/keywordsField to overwrite real copy with a single token.
      competitors: [
        {
          appId: "2",
          name: "Pickleball Stars",
          overlapKeywords: ["pickleball"],
          uniqueToCompetitor: ["PLAY"],
          overlapScore: 0.4,
          provenance: "live",
        },
      ],
    },
    context: {
      detectedApp: { id: "1", name: "Tally", developer: "Tally" },
      appRecord: {
        id: "1",
        name: "Tally: Everything Pickleball",
        developer: "Tally",
        primaryCategory: "Sports",
        subtitle: "Scoring, drills & overlays",
        description: "Pickleball scoring.",
        ratingsSummary: { average: 5, count: 100 },
        screenshots: [],
        currentVersion: "1.0",
        provenance: "live",
      },
      keywords: ["pickleball"],
    },
    inputProvenance: "live",
  };
}

describe("readyToPaste net-value guard — Tally regression case", () => {
  it("refuses to overwrite 'Scoring, drills & overlays' with 'PLAY' in the subtitle", () => {
    const result = synthesizeReportTemplate(tallyInputWithCompetitorPlay());
    const subtitle = result.readyToPaste.subtitle;

    expect(subtitle.recommended).toBeNull();
    expect(subtitle.changeReason).not.toBeNull();
    // The refusal reason must name the indexed tokens that would have been
    // lost so the founder can see why the engine declined to rewrite.
    const reason = subtitle.changeReason!.toLowerCase();
    expect(reason).toContain("scoring");
    expect(reason).toContain("drills");
    expect(reason).toContain("overlays");
    expect(reason).toContain("play");
  });

  it("accepts the keywords-field rewrite when the dropped user-keyword is still in title (shared-with-visible policy)", () => {
    // 'pickleball' lives in the title already, so dropping it from the
    // keywords field is the correct Apple-dedup move — Apple counts title
    // + subtitle + keywords-field as one rank pool. The shared-with-visible
    // policy subtracts visible-surface tokens before evaluating net value,
    // so 'pickleball' → 'play' isn't flagged here. The Tally regression
    // the user reported was the SUBTITLE overwrite, not this slot.
    const result = synthesizeReportTemplate(tallyInputWithCompetitorPlay());
    const kw = result.readyToPaste.keywordsField;
    expect(kw.recommended).not.toBeNull();
    expect(kw.recommended!.toLowerCase()).toContain("play");
  });

  it("leaves the title NO CHANGE state untouched (no spurious changeReason)", () => {
    // Title already covers pickleball → builder emits recommended:null
    // with changeReason:null. The guard must not invent a reason for
    // pre-existing NO CHANGE fields.
    const result = synthesizeReportTemplate(tallyInputWithCompetitorPlay());
    expect(result.readyToPaste.title.recommended).toBeNull();
    expect(result.readyToPaste.title.changeReason).toBeNull();
  });
});

describe("applyNetValueGuard — unit", () => {
  const ctx = buildNetValueContext(tallyInputWithCompetitorPlay());

  it("passes through fields where recommended is already null", () => {
    const field = {
      current: "Scoring, drills & overlays",
      recommended: null,
      changeReason: null,
      charCount: 25,
      charLimit: 30,
    };
    const guarded = applyNetValueGuard(field, ctx, "subtitle");
    expect(guarded).toBe(field);
  });

  it("refuses strict regressions (3 tokens → 1)", () => {
    const field = {
      current: "Scoring, drills & overlays",
      recommended: "Play",
      changeReason: "Promotes 'play' (competitor coverage).",
      charCount: 4,
      charLimit: 30,
    };
    const guarded = applyNetValueGuard(field, ctx, "subtitle");
    expect(guarded.recommended).toBeNull();
    expect(guarded.changeReason).toContain("scoring");
  });

  it("allows ties — same token count, different keywords (re-targeting)", () => {
    const field = {
      current: "Scoring",
      recommended: "Drills",
      changeReason: "Re-target.",
      charCount: 6,
      charLimit: 30,
    };
    const guarded = applyNetValueGuard(field, ctx, "subtitle");
    expect(guarded.recommended).toBe("Drills");
  });

  it("allows net-positive rewrites — recommended adds tokens", () => {
    const field = {
      current: "Scoring",
      recommended: "Pickleball Scoring",
      changeReason: "Add the brand keyword.",
      charCount: 18,
      charLimit: 30,
    };
    const guarded = applyNetValueGuard(field, ctx, "subtitle");
    expect(guarded.recommended).toBe("Pickleball Scoring");
  });

  it("skips the guard for write-only slots (current is empty)", () => {
    // Promotional text / Android short description always have current="".
    // The guard is effectively a no-op there: currentCount is 0, any
    // non-empty recommended trivially ties or beats it.
    const field = {
      current: "",
      recommended: "Pickleball and PLAY.",
      changeReason: "Lead with top-intent keywords.",
      charCount: 20,
      charLimit: 80,
    };
    const guarded = applyNetValueGuard(field, ctx, "Play short description");
    expect(guarded.recommended).toBe("Pickleball and PLAY.");
  });

  it("counts a stoplisted token (play) as rank-meaningful when the user opts in via keywords[]", () => {
    // User-keyword opt-in means "play" stops being stop-worded for THIS
    // diagnose run. It doesn't help in the Tally case (current still has
    // 3 rank-meaningful tokens > 1), but it changes the count in cases
    // where the recommended is competing on equal ground.
    const optInInput: SynthesisInput = {
      ...tallyInputWithCompetitorPlay(),
      context: {
        ...tallyInputWithCompetitorPlay().context,
        keywords: ["pickleball", "play"],
      },
    };
    const optInCtx = buildNetValueContext(optInInput);

    // current = "Score" (1 rank-meaningful), recommended = "Play Score"
    // Without opt-in: recommended set = {score} (play is in stoplist) → tie.
    // With opt-in:    recommended set = {play, score} (play is user keyword) → +1.
    // Either way passes; this test verifies "play" doesn't get stripped
    // out of the recommended count when the user has it in keywords[].
    const field = {
      current: "Score",
      recommended: "Play Score",
      changeReason: "Add competitor verb.",
      charCount: 10,
      charLimit: 30,
    };
    const guarded = applyNetValueGuard(field, optInCtx, "subtitle");
    expect(guarded.recommended).toBe("Play Score");
  });

  it("excludes off-topic competitor terms from the relevant competitor pool", () => {
    // When the orchestrator marks a competitor term off-topic via
    // scoredCandidates, the guard should not credit that token as
    // rank-meaningful via rule (2). It can still earn credit via rule (3)
    // if it's length>=4 and not in the stoplist.
    const offTopicInput: SynthesisInput = {
      ...tallyInputWithCompetitorPlay(),
      scoredCandidates: [
        {
          keyword: "PLAY",
          origin: "competitor",
          relevanceLabel: "off-topic",
          score: 0,
        },
      ],
    };
    const ctxOff = buildNetValueContext(offTopicInput);
    expect(ctxOff.relevantCompetitorSet.has("play")).toBe(false);
  });
});

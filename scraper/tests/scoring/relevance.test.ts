import { describe, expect, it } from "vitest";
import {
  buildCandidatesFromCompetitors,
  scoreCandidates,
  type CandidateKeyword,
  type CompetitorRef,
  type ScoredCandidate,
} from "../../src/scoring/relevance.js";

function find(
  scored: readonly ScoredCandidate[],
  keyword: string,
): ScoredCandidate | undefined {
  return scored.find((c) => c.keyword === keyword.toLowerCase());
}

describe("scoreCandidates — relevance gate (Day 1, no embeddings)", () => {
  it("passes user-origin candidates through with on-topic label and score 1.0", () => {
    const scored = scoreCandidates({
      candidates: [
        { keyword: "pickleball", origin: "user" },
        { keyword: "dupr", origin: "user" },
      ],
      appContext: {
        appName: "PicklePro",
        primaryCategory: "Sports",
        userKeywords: ["pickleball", "dupr"],
      },
      competitorContexts: [],
    });
    expect(scored).toHaveLength(2);
    for (const c of scored) {
      expect(c.relevanceLabel).toBe("on-topic");
      expect(c.relevanceScore).toBe(1);
      expect(c.categoryMatch).toBe(true);
    }
  });

  it("PICKLEBALL REGRESSION: forces off-topic for competitor terms from a different-category competitor", () => {
    // The bleed case: a pickleball app (Sports) gets matched against a
    // generic Productivity-category competitor that surfaces tokens like
    // "tournament_bracket" and "daily_planner". Under the old code these
    // bled into readyToPaste.keywordsField.recommended; the gate now
    // forces them off-topic regardless of intent score.
    const competitorContexts: CompetitorRef[] = [
      {
        appId: "9999",
        name: "Daily Planner Pro",
        primaryCategory: "Productivity",
      },
    ];
    const candidates: CandidateKeyword[] = [
      {
        keyword: "tournament_bracket",
        origin: "competitor",
        sourceCompetitor: "9999",
      },
      {
        keyword: "daily_planner",
        origin: "competitor",
        sourceCompetitor: "9999",
      },
      {
        keyword: "meditation_timer",
        origin: "competitor",
        sourceCompetitor: "9999",
      },
    ];
    const scored = scoreCandidates({
      candidates,
      appContext: {
        appName: "PicklePro",
        primaryCategory: "Sports",
        userKeywords: ["pickleball"],
      },
      competitorContexts,
    });
    for (const c of scored) {
      expect(c.relevanceLabel).toBe("off-topic");
      expect(c.categoryMatch).toBe(false);
    }
  });

  it("passes competitor terms from a same-category competitor through normal scoring", () => {
    const competitorContexts: CompetitorRef[] = [
      {
        appId: "1234",
        name: "PickleScore",
        primaryCategory: "Sports",
      },
    ];
    const candidates: CandidateKeyword[] = [
      {
        keyword: "scoreboard",
        origin: "competitor",
        sourceCompetitor: "1234",
      },
      {
        keyword: "leaderboard",
        origin: "competitor",
        sourceCompetitor: "1234",
      },
    ];
    const scored = scoreCandidates({
      candidates,
      appContext: {
        appName: "PicklePro",
        primaryCategory: "Sports",
        userKeywords: ["pickleball"],
      },
      competitorContexts,
    });
    for (const c of scored) {
      expect(c.categoryMatch).toBe(true);
      expect(c.relevanceLabel).not.toBe("off-topic");
    }
  });

  it("treats autocomplete / asa-rec / review origins as inherently on-category", () => {
    const candidates: CandidateKeyword[] = [
      { keyword: "pickleball tournament", origin: "autocomplete" },
      { keyword: "court reservation", origin: "asa-rec" },
      { keyword: "pickle paddle", origin: "review" },
    ];
    const scored = scoreCandidates({
      candidates,
      appContext: {
        appName: "PicklePro",
        primaryCategory: "Sports",
        userKeywords: ["pickleball"],
      },
      competitorContexts: [],
    });
    for (const c of scored) {
      expect(c.categoryMatch).toBe(true);
      expect(c.relevanceLabel).not.toBe("off-topic");
    }
  });

  it("dedupes by lowercased keyword", () => {
    const candidates: CandidateKeyword[] = [
      { keyword: "Pickleball", origin: "user" },
      { keyword: "pickleball", origin: "user" },
      { keyword: "PICKLEBALL", origin: "user" },
    ];
    const scored = scoreCandidates({
      candidates,
      appContext: {
        appName: "PicklePro",
        primaryCategory: "Sports",
        userKeywords: ["pickleball"],
      },
      competitorContexts: [],
    });
    expect(scored).toHaveLength(1);
    expect(scored[0]?.keyword).toBe("pickleball");
  });

  it("treats missing competitor primaryCategory as a category mismatch (off-topic for competitor terms)", () => {
    const competitorContexts: CompetitorRef[] = [
      {
        appId: "5555",
        name: "Mystery App",
        primaryCategory: undefined,
      },
    ];
    const scored = scoreCandidates({
      candidates: [
        {
          keyword: "feature",
          origin: "competitor",
          sourceCompetitor: "5555",
        },
      ],
      appContext: {
        appName: "PicklePro",
        primaryCategory: "Sports",
        userKeywords: ["pickleball"],
      },
      competitorContexts,
    });
    expect(scored[0]?.relevanceLabel).toBe("off-topic");
    expect(scored[0]?.categoryMatch).toBe(false);
  });

  it("propagates popularity through scoring", () => {
    const scored = scoreCandidates({
      candidates: [
        { keyword: "court", origin: "asa-rec", popularity: 72 },
      ],
      appContext: {
        appName: "PicklePro",
        primaryCategory: "Sports",
        userKeywords: ["pickleball"],
      },
      competitorContexts: [],
    });
    expect(scored[0]?.popularity).toBe(72);
  });

  it("skips empty/whitespace keywords", () => {
    const scored = scoreCandidates({
      candidates: [
        { keyword: "", origin: "user" },
        { keyword: "   ", origin: "user" },
        { keyword: "real", origin: "user" },
      ],
      appContext: {
        appName: "PicklePro",
        primaryCategory: "Sports",
        userKeywords: ["pickleball"],
      },
      competitorContexts: [],
    });
    expect(scored).toHaveLength(1);
    expect(scored[0]?.keyword).toBe("real");
  });
});

describe("buildCandidatesFromCompetitors", () => {
  it("emits one candidate per unique term across all competitors with the competitor's appId attached", () => {
    const candidates = buildCandidatesFromCompetitors([
      { appId: "100", uniqueToCompetitor: ["alpha", "beta"] },
      { appId: "200", uniqueToCompetitor: ["beta", "gamma"] },
    ]);
    expect(candidates).toHaveLength(3);
    const map = new Map(candidates.map((c) => [c.keyword, c]));
    expect(map.get("alpha")?.sourceCompetitor).toBe("100");
    expect(map.get("beta")?.sourceCompetitor).toBe("100");
    expect(map.get("gamma")?.sourceCompetitor).toBe("200");
    for (const c of candidates) {
      expect(c.origin).toBe("competitor");
    }
  });
});

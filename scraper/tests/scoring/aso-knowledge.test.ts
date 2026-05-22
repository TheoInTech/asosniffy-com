import { describe, expect, it } from "vitest";
import {
  ASO_KNOWLEDGE_BASE,
  ASO_KNOWLEDGE_VERSION,
  getKnowledgeByTopic,
  getKnowledgeForRecommendation,
  inferKnowledgeTopic,
} from "../../src/scoring/aso-knowledge.js";

describe("ASO_KNOWLEDGE_BASE — corpus invariants", () => {
  it("ships at least one entry", () => {
    expect(ASO_KNOWLEDGE_BASE.length).toBeGreaterThan(0);
  });

  it("publishes a versioned fingerprint", () => {
    expect(ASO_KNOWLEDGE_VERSION).toMatch(/^\d{4}-\d{2}-\d+$/);
  });

  it("uses unique topic keys", () => {
    const topics = ASO_KNOWLEDGE_BASE.map((e) => e.topic);
    const unique = new Set(topics);
    expect(unique.size).toBe(topics.length);
  });

  it("every entry has a non-empty summary", () => {
    for (const e of ASO_KNOWLEDGE_BASE) {
      expect(e.summary.trim().length).toBeGreaterThan(20);
    }
  });

  it("every source URL is a parseable HTTPS URL", () => {
    for (const e of ASO_KNOWLEDGE_BASE) {
      // Throws on malformed URL — caught means the test fails the corpus.
      const url = new URL(e.source.url);
      expect(url.protocol).toBe("https:");
    }
  });

  it("only cites primary sources (Apple / App Store / Google Play)", () => {
    const allowedHosts = [
      "searchads.apple.com",
      "developer.apple.com",
      "support.google.com",
    ];
    for (const e of ASO_KNOWLEDGE_BASE) {
      const url = new URL(e.source.url);
      expect(allowedHosts).toContain(url.hostname);
    }
  });

  it("never names a specific competitor product in the summary text", () => {
    const banned = [
      "asolytics",
      "apptweak",
      "mobile action",
      "mobileaction",
      "appfigures",
      "sensor tower",
      "sensortower",
    ];
    for (const e of ASO_KNOWLEDGE_BASE) {
      const lower = e.summary.toLowerCase();
      for (const term of banned) {
        expect(lower).not.toContain(term);
      }
    }
  });
});

describe("inferKnowledgeTopic — topic routing", () => {
  // Each row is [intended topic, sample text that should route there].
  const ROUTES: Array<[string, string]> = [
    [
      "title-30-char-cap",
      "Title is 32 characters — over the 30 cap. Trim by 2 chars.",
    ],
    [
      "title-keyword-weight",
      "Title doesn't include your primary keyword. Add it for higher rank weight.",
    ],
    [
      "subtitle-distinct-keywords",
      "Your subtitle repeats words from the title — wasted budget.",
    ],
    [
      "keyword-field-no-spaces",
      "Keywords field uses spaces after commas — strip them to reclaim bytes.",
    ],
    [
      "keyword-field-no-redundant-terms",
      "Keyword field contains the app name; drop it for an extra slot.",
    ],
    [
      "description-indexed-android",
      "On Android, the description is indexed — lift density of your keyword.",
    ],
    [
      "description-not-indexed-ios",
      "iOS description is not indexed for search — treat it as conversion copy.",
    ],
    [
      "screenshot-captions-indexed",
      "Screenshot captions are read by Apple's semantic search — add the keyword.",
    ],
    [
      "localization-per-storefront",
      "Listing is English-only but the storefront is Japan — translate the metadata.",
    ],
    [
      "ratings-as-ranking-signal",
      "Average rating is dragging your search rank — focus on review prompts.",
    ],
    [
      "promotional-text-refreshable",
      "Update promotional text — refreshable without an App Review submission.",
    ],
    [
      "match-granularity-phrase-exact",
      "Switch to exact-phrase match — scattered all-words is hurting rank.",
    ],
  ];

  for (const [expected, text] of ROUTES) {
    it(`routes to ${expected}: "${text.slice(0, 50)}…"`, () => {
      expect(inferKnowledgeTopic(text)).toBe(expected);
    });
  }

  it("returns null when no topic pattern matches", () => {
    expect(inferKnowledgeTopic("Generic free-form text with no ASO content.")).toBeNull();
    expect(inferKnowledgeTopic("")).toBeNull();
  });

  it("does not false-positive on neighboring topics (title length vs title weight)", () => {
    // "title is 32 chars" → title-30-char-cap, not title-keyword-weight
    expect(
      inferKnowledgeTopic("Your title is 32 characters."),
    ).toBe("title-30-char-cap");
    // "title missing primary keyword" → title-keyword-weight
    expect(
      inferKnowledgeTopic("Title is missing your primary keyword."),
    ).toBe("title-keyword-weight");
  });

  it("prefers screenshots over descriptions when both signals appear", () => {
    // Screenshot mention wins because it appears first in the matcher list
    // for its specific topic; descriptions only route when the android/iOS
    // qualifier shows up.
    expect(
      inferKnowledgeTopic("Add your keyword to screenshot caption text."),
    ).toBe("screenshot-captions-indexed");
  });
});

describe("getKnowledgeByTopic — direct lookup", () => {
  it("returns the matching entry by topic key", () => {
    const entry = getKnowledgeByTopic("title-30-char-cap");
    expect(entry).not.toBeNull();
    expect(entry?.topic).toBe("title-30-char-cap");
    expect(entry?.summary).toContain("30 characters");
  });

  it("returns null for unknown topic keys", () => {
    expect(getKnowledgeByTopic("not-a-real-topic")).toBeNull();
    expect(getKnowledgeByTopic("")).toBeNull();
  });
});

describe("getKnowledgeForRecommendation — composite lookup", () => {
  it("finds an entry from action text alone", () => {
    const entry = getKnowledgeForRecommendation({
      action: "Trim title to under 30 chars.",
      rationale: "Currently over the cap.",
    });
    expect(entry?.topic).toBe("title-30-char-cap");
  });

  it("finds an entry from rationale text when action is generic", () => {
    const entry = getKnowledgeForRecommendation({
      action: "Update your listing.",
      rationale:
        "On Android, the description is indexed for search — lift exact-phrase density.",
    });
    expect(entry?.topic).toBe("description-indexed-android");
  });

  it("returns null when neither text matches any topic", () => {
    expect(
      getKnowledgeForRecommendation({
        action: "Generic suggestion.",
        rationale: "No specific ASO topic referenced.",
      }),
    ).toBeNull();
  });

  it("returned entries carry their primary source citation", () => {
    const entry = getKnowledgeForRecommendation({
      action: "Repeating keyword across title and subtitle.",
      rationale: "Subtitle duplicates the title's primary keyword.",
    });
    expect(entry?.source.name).toBeTruthy();
    expect(entry?.source.url).toMatch(/^https:\/\//);
  });
});

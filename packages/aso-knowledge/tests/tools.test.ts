import { describe, expect, it } from "vitest";
import { buildTools } from "../src/tools.js";
import { ASO_KNOWLEDGE_BASE, ASO_KNOWLEDGE_VERSION } from "../src/data.js";

// Helper: index the tools by name so each test calls the right handler
// without depending on array order.
function toolsByName() {
  const out = new Map<string, ReturnType<typeof buildTools>[number]>();
  for (const t of buildTools()) out.set(t.name, t);
  return out;
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const tool = toolsByName().get(name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool.handler(args);
}

describe("buildTools — registration", () => {
  it("exposes exactly three tools", () => {
    const tools = buildTools();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "aso_knowledge_get_topic",
      "aso_knowledge_list_topics",
      "aso_knowledge_lookup",
    ]);
  });

  it("each tool has a non-trivial description", () => {
    for (const tool of buildTools()) {
      expect(tool.config.description.length).toBeGreaterThan(100);
    }
  });
});

describe("aso_knowledge_list_topics", () => {
  it("returns every topic in the corpus", async () => {
    const result = await callTool("aso_knowledge_list_topics");
    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as {
      version: string;
      topics: Array<{ topic: string; sourceUrl: string }>;
    };
    expect(sc.version).toBe(ASO_KNOWLEDGE_VERSION);
    expect(sc.topics).toHaveLength(ASO_KNOWLEDGE_BASE.length);
  });

  it("every returned entry carries a citation URL", async () => {
    const result = await callTool("aso_knowledge_list_topics");
    const sc = result.structuredContent as {
      topics: Array<{ topic: string; sourceUrl: string }>;
    };
    for (const t of sc.topics) {
      const url = new URL(t.sourceUrl);
      expect(url.protocol).toBe("https:");
    }
  });
});

describe("aso_knowledge_get_topic", () => {
  it("returns the matching entry for a known topic key", async () => {
    const result = await callTool("aso_knowledge_get_topic", {
      topic: "title-30-char-cap",
    });
    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as {
      topic: string;
      summary: string;
      sourceName: string;
      sourceUrl: string;
    };
    expect(sc.topic).toBe("title-30-char-cap");
    expect(sc.summary).toContain("30 characters");
    expect(sc.sourceUrl).toMatch(/^https:\/\//);
  });

  it("returns isError + topic_not_found for unknown topic keys", async () => {
    const result = await callTool("aso_knowledge_get_topic", {
      topic: "not-a-real-topic",
    });
    expect(result.isError).toBe(true);
    const sc = result.structuredContent as { error: string; topic: string };
    expect(sc.error).toBe("topic_not_found");
    expect(sc.topic).toBe("not-a-real-topic");
  });

  it("returns isError on missing topic arg (schema validation)", async () => {
    const result = await callTool("aso_knowledge_get_topic", {});
    expect(result.isError).toBe(true);
  });
});

describe("aso_knowledge_lookup", () => {
  it("returns the matched topic for relevant text", async () => {
    const result = await callTool("aso_knowledge_lookup", {
      text: "Your title is 32 characters — over the 30 cap.",
    });
    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as {
      match: { topic: string } | null;
    };
    expect(sc.match?.topic).toBe("title-30-char-cap");
  });

  it("returns match:null for off-topic text", async () => {
    const result = await callTool("aso_knowledge_lookup", {
      text: "Generic free-form text with no ASO content.",
    });
    expect(result.isError).toBeUndefined();
    const sc = result.structuredContent as { match: null };
    expect(sc.match).toBeNull();
  });

  it("returns isError on missing text arg (schema validation)", async () => {
    const result = await callTool("aso_knowledge_lookup", {});
    expect(result.isError).toBe(true);
  });

  it("routes android-density text to the indexed-android topic", async () => {
    const result = await callTool("aso_knowledge_lookup", {
      text: "On Android, the description is indexed — lift density for your keyword.",
    });
    const sc = result.structuredContent as {
      match: { topic: string } | null;
    };
    expect(sc.match?.topic).toBe("description-indexed-android");
  });

  // ---- Wave 1 corpus additions (2026-06-2) ----

  it("routes rating-reset text to the per-version reset topic, not the generic ratings signal", async () => {
    const result = await callTool("aso_knowledge_lookup", {
      text: "Reset the summary rating on your next release — the current version trends above the lifetime average.",
    });
    const sc = result.structuredContent as {
      match: { topic: string } | null;
    };
    expect(sc.match?.topic).toBe("ios-rating-reset-per-version");
  });

  it("routes Play quality-gate text to play-core-value-gates", async () => {
    const result = await callTool("aso_knowledge_lookup", {
      text: "DAU/MAU sits below the 8% Core Value bar — Play may warn on your store listing.",
    });
    const sc = result.structuredContent as {
      match: { topic: string } | null;
    };
    expect(sc.match?.topic).toBe("play-core-value-gates");
  });

  it("keeps PPO and Play listing experiments distinct", async () => {
    const ppo = await callTool("aso_knowledge_lookup", {
      text: "Run a product page optimization test with one treatment — your traffic can reach 90% confidence inside 90 days.",
    });
    expect(
      (ppo.structuredContent as { match: { topic: string } | null }).match
        ?.topic,
    ).toBe("ios-ppo-product-page-optimization");

    const play = await callTool("aso_knowledge_lookup", {
      text: "Set up a free store listing experiment in Play Console to test icon variants.",
    });
    expect(
      (play.structuredContent as { match: { topic: string } | null }).match
        ?.topic,
    ).toBe("play-store-listing-experiments");
  });
});

describe("package contract guarantees", () => {
  it("version fingerprint matches between data and tool output", async () => {
    const result = await callTool("aso_knowledge_list_topics");
    const sc = result.structuredContent as { version: string };
    expect(sc.version).toBe(ASO_KNOWLEDGE_VERSION);
  });

  it("corpus contains only primary-source URLs", () => {
    // play.google.com added 2026-06 for the Play Console "store listing
    // experiments" about-page — a first-party Google property and the
    // canonical URL named in docs/research/2026-06-discoverability/
    // research-store-conversion.md. Still primary-only: no vendor blogs.
    const allowedHosts = [
      "searchads.apple.com",
      "developer.apple.com",
      "support.google.com",
      "play.google.com",
    ];
    for (const entry of ASO_KNOWLEDGE_BASE) {
      const url = new URL(entry.source.url);
      expect(allowedHosts).toContain(url.hostname);
    }
  });

  it("topic keys are unique", () => {
    const topics = ASO_KNOWLEDGE_BASE.map((e) => e.topic);
    const unique = new Set(topics);
    expect(unique.size).toBe(topics.length);
  });
});

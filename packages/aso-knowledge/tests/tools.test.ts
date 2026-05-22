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
});

describe("package contract guarantees", () => {
  it("version fingerprint matches between data and tool output", async () => {
    const result = await callTool("aso_knowledge_list_topics");
    const sc = result.structuredContent as { version: string };
    expect(sc.version).toBe(ASO_KNOWLEDGE_VERSION);
  });

  it("corpus contains only primary-source URLs", () => {
    const allowedHosts = [
      "searchads.apple.com",
      "developer.apple.com",
      "support.google.com",
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

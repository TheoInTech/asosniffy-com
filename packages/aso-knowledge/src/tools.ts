import { z } from "zod";
import {
  ASO_KNOWLEDGE_VERSION,
  getKnowledgeByTopic,
  inferKnowledgeTopic,
  listKnowledgeTopics,
} from "./data.js";

const PRIMER =
  "Curated App Store Optimization best practices from primary sources " +
  "(Apple Human Interface Guidelines, Apple Search Ads docs, App Store Connect Help, " +
  "Play Store Help, App Store Review Guidelines). No third-party blog content; " +
  "no tool-vendor commentary. Every topic carries a sourceUrl agents can verify.";

const listInputSchema = {} as const;

const getInputSchema = {
  topic: z
    .string()
    .min(1)
    .describe(
      "Topic key — one of the topics returned by aso_knowledge_list_topics " +
        "(e.g. 'title-30-char-cap', 'subtitle-distinct-keywords').",
    ),
} as const;

const lookupInputSchema = {
  text: z
    .string()
    .min(1)
    .describe(
      "Free-form text (a question, a snippet of recommendation copy, an app store metadata field). " +
        "The tool pattern-matches the text against the topic matchers and returns the best-fit topic " +
        "entry, or null when nothing matches. Use this when the agent doesn't already have a topic key.",
    ),
} as const;

export interface ToolDef {
  name: string;
  config: {
    description: string;
    inputSchema?: z.ZodRawShape;
  };
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }>;
}

function asText(value: unknown): { type: "text"; text: string } {
  return { type: "text", text: JSON.stringify(value, null, 2) };
}

export function buildTools(): ToolDef[] {
  return [
    {
      name: "aso_knowledge_list_topics",
      config: {
        description:
          "List every curated ASO topic with its summary and primary-source citation. " +
          "Use this when starting a new ASO conversation to ground your recommendations in canonical references. " +
          PRIMER,
        inputSchema: listInputSchema,
      },
      handler: async () => {
        const topics = listKnowledgeTopics();
        const result = {
          version: ASO_KNOWLEDGE_VERSION,
          topics: topics.map((t) => ({
            topic: t.topic,
            summary: t.summary,
            sourceName: t.source.name,
            sourceUrl: t.source.url,
            ...(t.source.section !== undefined
              ? { sourceSection: t.source.section }
              : {}),
          })),
        };
        return {
          content: [asText(result)],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      },
    },
    {
      name: "aso_knowledge_get_topic",
      config: {
        description:
          "Fetch a single ASO topic by its key (returned by aso_knowledge_list_topics). " +
          "Returns the full curated entry with summary + primary-source citation, or an error " +
          "when the topic key is unknown. " +
          PRIMER,
        inputSchema: getInputSchema,
      },
      handler: async (args) => {
        try {
          const input = z.object(getInputSchema).parse(args);
          const entry = getKnowledgeByTopic(input.topic);
          if (!entry) {
            const result = {
              error: "topic_not_found" as const,
              topic: input.topic,
              hint:
                "Call aso_knowledge_list_topics to see the available topic keys, " +
                "or use aso_knowledge_lookup with free-form text to find a topic.",
            };
            return {
              content: [asText(result)],
              structuredContent: result as unknown as Record<string, unknown>,
              isError: true,
            };
          }
          const result = {
            version: ASO_KNOWLEDGE_VERSION,
            topic: entry.topic,
            summary: entry.summary,
            sourceName: entry.source.name,
            sourceUrl: entry.source.url,
            ...(entry.source.section !== undefined
              ? { sourceSection: entry.source.section }
              : {}),
          };
          return {
            content: [asText(result)],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: `aso_knowledge_get_topic failed: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },
    {
      name: "aso_knowledge_lookup",
      config: {
        description:
          "Look up the best-fit curated ASO topic for a free-form text snippet. " +
          "Pattern-matches the text against every topic and returns the first match — " +
          "or { match: null } when nothing matches. Use this to ground your own " +
          "recommendation prose in a canonical citation without hard-coding topic keys. " +
          PRIMER,
        inputSchema: lookupInputSchema,
      },
      handler: async (args) => {
        try {
          const input = z.object(lookupInputSchema).parse(args);
          const topic = inferKnowledgeTopic(input.text);
          if (!topic) {
            const result = { version: ASO_KNOWLEDGE_VERSION, match: null };
            return {
              content: [asText(result)],
              structuredContent: result as unknown as Record<string, unknown>,
            };
          }
          const entry = getKnowledgeByTopic(topic);
          if (!entry) {
            const result = { version: ASO_KNOWLEDGE_VERSION, match: null };
            return {
              content: [asText(result)],
              structuredContent: result as unknown as Record<string, unknown>,
            };
          }
          const result = {
            version: ASO_KNOWLEDGE_VERSION,
            match: {
              topic: entry.topic,
              summary: entry.summary,
              sourceName: entry.source.name,
              sourceUrl: entry.source.url,
              ...(entry.source.section !== undefined
                ? { sourceSection: entry.source.section }
                : {}),
            },
          };
          return {
            content: [asText(result)],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: `aso_knowledge_lookup failed: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },
  ];
}

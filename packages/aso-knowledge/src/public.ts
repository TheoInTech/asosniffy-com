// Public TypeScript surface of @gosniffy/aso-knowledge for non-MCP consumers
// (the scraper's sync-guard test, future SDK integrations). The MCP server
// itself lives at ./index.ts and is wired via the `bin` field.

export {
  ASO_KNOWLEDGE_BASE,
  ASO_KNOWLEDGE_VERSION,
  getKnowledgeByTopic,
  inferKnowledgeTopic,
  listKnowledgeTopics,
  type KnowledgeEntry,
  type KnowledgeSource,
} from "./data.js";

export { buildTools, type ToolDef } from "./tools.js";

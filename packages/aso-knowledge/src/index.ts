#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "../package.json" with { type: "json" };
import { buildTools } from "./tools.js";

// @gosniffy/aso-knowledge — standalone MCP server. No wallet, no payment, no
// network. Pure curated knowledge served over stdio. Pairs with @gosniffy/mcp:
// the latter handles paid quote/diagnose calls; this one handles the free
// "what does Apple actually say about X?" lookups that ground agent
// recommendations in primary-source citations.

const server = new McpServer(
  { name: "sniffy-aso-knowledge", version: pkg.version },
  { capabilities: { tools: {} } },
);

for (const tool of buildTools()) {
  server.registerTool(tool.name, tool.config, tool.handler as never);
}

await server.connect(new StdioServerTransport());

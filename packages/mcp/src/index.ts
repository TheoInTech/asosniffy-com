#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSniffy } from "@gosniffy/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { buildTools } from "./tools.js";
import pkg from "../package.json" with { type: "json" };

const BASE_URL = process.env["SNIFFY_BASE_URL"] ?? "https://api.sniffy.io";
const PRIVATE_KEY = process.env["SNIFFY_PRIVATE_KEY"];

const signer =
  PRIVATE_KEY !== undefined && PRIVATE_KEY.length > 0
    ? privateKeyToAccount(PRIVATE_KEY as `0x${string}`)
    : undefined;

const client = createSniffy({
  baseUrl: BASE_URL,
  signer,
  clientId: `@gosniffy/mcp@${pkg.version}`,
});

const server = new McpServer(
  { name: "sniffy", version: pkg.version },
  { capabilities: { tools: {} } },
);

for (const tool of buildTools(client)) {
  server.registerTool(tool.name, tool.config, tool.handler as never);
}

await server.connect(new StdioServerTransport());

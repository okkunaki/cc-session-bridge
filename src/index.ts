#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

const server = new McpServer({ name: "cc-session-bridge", version: "0.0.1" });

server.registerTool(
  "ping",
  { description: "Health check. Returns 'pong'." },
  async () => ({ content: [{ type: "text", text: "pong" }] }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("cc-session-bridge: MCP server running on stdio");
}

main().catch((error) => {
  console.error("cc-session-bridge: fatal error:", error);
  process.exit(1);
});

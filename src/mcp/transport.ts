import type { FastifyInstance } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";

// One shared transport instance per server — the SDK manages per-request SSE streams internally.
// Stateful mode: the SDK mints a session id and validates it on subsequent requests.
function createTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
}

// Mounts the MCP Streamable HTTP transport on /mcp via Fastify.
// All HTTP methods on /mcp are forwarded to the SDK transport which handles:
//   - POST  → JSON-RPC over HTTP (tool calls, initialize)
//   - GET   → SSE stream for server-initiated notifications (tools/list_changed)
//   - DELETE → session teardown
// The reply is hijacked so Fastify doesn't interfere with the SDK's direct writes to res.raw.
export function registerMcpTransport(app: FastifyInstance, mcpServer: McpServer): void {
  const transport = createTransport();

  mcpServer.connect(transport).catch((err: unknown) => {
    app.log.error({ err }, "MCP transport connect error");
  });

  app.all("/mcp", async (req, reply) => {
    // Hijack the reply so Fastify doesn't write status/headers after the transport does.
    await reply.hijack();
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
}

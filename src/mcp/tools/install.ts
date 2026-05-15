import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodTypeAny } from "zod";

// ZodRawShapeCompat from the SDK is effectively Record<string, ZodTypeAny>.
// Using our own alias avoids importing from deep internal SDK paths.
type ZodShape = Record<string, ZodTypeAny>;

// Wires the real schema + handler into a pre-registered stub tool.
// Centralises the activeTools.get() / null-guard / update() boilerplate so each of the
// 14 tool files only declares its schema + domain logic.
//
// The callback is typed loosely (args: any) because:
// - The SDK validates inputs against paramsSchema BEFORE calling the callback.
// - Each tool file's callback types its own args via the Zod inference at the call site.
// - Threading generic Args through installTool would require importing ZodRawShapeCompat
//   from deep internal SDK paths, which we avoid per mcp-sdk-tool-visibility gotcha.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolCallback = (args: any, extra: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

export function installTool(
  activeTools: ReadonlyMap<string, RegisteredTool>,
  name: string,
  config: {
    description: string;
    paramsSchema: ZodShape;
    callback: AnyToolCallback;
  },
): void {
  const tool = activeTools.get(name);
  // All 14 names were registered as stubs in buildMcpServer — if one is missing
  // it is a programmer error (ACTIVE_TOOL_NAMES mismatch), so throw early.
  if (!tool) throw new Error(`installTool: stub not found for "${name}"`);

  // The SDK's update() accepts paramsSchema as ZodRawShapeCompat (= Record<string, ZodTypeAny>)
  // and callback as ToolCallback. We cast both since our local types are structurally identical.
  tool.update({
    description: config.description,
    paramsSchema: config.paramsSchema as Parameters<RegisteredTool["update"]>[0]["paramsSchema"],
    callback: config.callback as Parameters<RegisteredTool["update"]>[0]["callback"],
  });
}

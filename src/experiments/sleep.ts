// TEMPORARY: timeout probe. Delete this file and its registration in src/index.ts after measurement.
import { appendFile, mkdir } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const LOG_DIR = ".cc-bridge";
const LOG_FILE = `${LOG_DIR}/probe.log`;
const PROGRESS_INTERVAL_MS = 5000;

async function probeLog(event: string, detail?: unknown): Promise<void> {
  const line = `${new Date().toISOString()} ${event}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}\n`;
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, line);
  } catch (error) {
    console.error("probe log failed:", error);
  }
}

export function registerSleepProbe(server: McpServer): void {
  server.registerTool(
    "sleep",
    {
      description:
        "[EXPERIMENT] Waits for the given number of seconds, then returns. Temporary tool for measuring MCP tool-call timeouts.",
      inputSchema: z.object({
        seconds: z.number().int().min(1).max(600),
        progress: z.boolean().optional().default(false),
      }),
    },
    async ({ seconds, progress }, ctx) => {
      const { signal } = ctx.mcpReq;
      const token = ctx.mcpReq._meta?.progressToken;
      const start = Date.now();
      await probeLog("start", { seconds, progress, hasProgressToken: token !== undefined });

      const timer = setInterval(() => {
        if (!progress) return;
        const elapsed = Math.round((Date.now() - start) / 1000);
        void probeLog("progress", { elapsed, sent: token !== undefined });
        if (token === undefined) return;
        ctx.mcpReq
          .notify({
            method: "notifications/progress",
            params: { progressToken: token, progress: elapsed, total: seconds },
          })
          .catch((error: unknown) => console.error("progress notify failed:", error));
      }, PROGRESS_INTERVAL_MS);

      const cancelled = await new Promise<boolean>((resolve) => {
        if (signal.aborted) return resolve(true);
        const done = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve(false);
        }, seconds * 1000);
        const onAbort = () => {
          clearTimeout(done);
          resolve(true);
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
      clearInterval(timer);

      const waited = Math.round((Date.now() - start) / 100) / 10;
      if (cancelled) {
        await probeLog("cancelled", { waited_seconds: waited, reason: String(signal.reason) });
        return { content: [{ type: "text", text: JSON.stringify({ status: "cancelled", waited_seconds: waited }) }] };
      }
      await probeLog("done", { waited_seconds: waited });
      return { content: [{ type: "text", text: JSON.stringify({ status: "done", waited_seconds: waited }) }] };
    },
  );
}

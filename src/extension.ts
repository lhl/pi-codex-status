import { readCachedSnapshot, writeCachedSnapshot } from "./cache.js";
import { formatJson, formatStatus, formatStatusline } from "./format.js";
import { parseCodexRateLimitHeaders } from "./rate-limits.js";
import type { CodexUsageSnapshot, RateLimit } from "./types.js";
import { getCodexUsage } from "./usage.js";

type CommandContext = {
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: "info" | "warning" | "error" | "success") => void;
    setStatus?: (key: string, text?: string) => void;
    theme?: { fg?: (name: string, text: string) => string };
  };
};

type PiApi = {
  registerCommand: (
    name: string,
    options: {
      description?: string;
      getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string; description?: string }> | null;
      handler: (args: string, ctx: CommandContext) => Promise<void> | void;
    },
  ) => void;
  on: (event: string, handler: (event: any, ctx: CommandContext) => Promise<void> | void) => void;
  sendMessage?: (
    message: { customType: string; content: string; display: boolean; details?: unknown },
    options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
  ) => void;
};

const STATUS_KEY = "codex-status";
const MESSAGE_TYPE = "codex-status";
const CACHE_TTL_MS = 60_000;

function dim(ctx: CommandContext, text: string): string {
  return ctx.ui?.theme?.fg ? ctx.ui.theme.fg("dim", text) : text;
}

function setFooterStatus(ctx: CommandContext, snapshot: CodexUsageSnapshot | undefined): void {
  if (!ctx.ui?.setStatus) return;
  if (!snapshot) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }
  ctx.ui.setStatus(STATUS_KEY, dim(ctx, formatStatusline(snapshot)));
}

function mergeLimit(existing: RateLimit | undefined, update: RateLimit | undefined): RateLimit | undefined {
  if (!existing) return update;
  if (!update) return existing;
  const primary = update.primary ?? existing.primary;
  const secondary = update.secondary ?? existing.secondary;
  return {
    ...existing,
    ...update,
    ...(primary ? { primary } : {}),
    ...(secondary ? { secondary } : {}),
  };
}

function mergeSnapshots(
  existing: CodexUsageSnapshot | undefined,
  update: CodexUsageSnapshot,
): CodexUsageSnapshot {
  if (!existing) return update;

  const byId = new Map(existing.additionalLimits.map((limit) => [limit.id, limit]));
  for (const limit of update.additionalLimits) {
    byId.set(limit.id, mergeLimit(byId.get(limit.id), limit)!);
  }

  const defaultLimit = mergeLimit(existing.defaultLimit, update.defaultLimit);
  const credits = update.credits ?? existing.credits;
  const spendControl = update.spendControl ?? existing.spendControl;
  return {
    ...existing,
    ...update,
    account: { ...existing.account, ...update.account },
    ...(defaultLimit ? { defaultLimit } : {}),
    additionalLimits: [...byId.values()],
    ...(credits ? { credits } : {}),
    ...(spendControl ? { spendControl } : {}),
  };
}

function messageFor(kind: "status" | "json" | "raw" | "statusline", snapshot: CodexUsageSnapshot): string {
  if (kind === "json") return `\`\`\`json\n${formatJson(snapshot)}\n\`\`\``;
  if (kind === "raw") return `\`\`\`json\n${JSON.stringify(snapshot.raw ?? snapshot, null, 2)}\n\`\`\``;
  if (kind === "statusline") return `\`\`\`\n${formatStatusline(snapshot)}\n\`\`\``;
  return `\`\`\`\n${formatStatus(snapshot)}\n\`\`\``;
}

function unfence(content: string): string {
  return content.replace(/^```(?:json)?\n/, "").replace(/\n```$/, "");
}

function emitStatus(pi: PiApi, ctx: CommandContext, content: string, details?: unknown): void {
  if (ctx.hasUI === false) {
    console.log(unfence(content));
    return;
  }
  if (pi.sendMessage) {
    // No delivery options while idle: append and emit immediately. `deliverAs: "nextTurn"`
    // only queues the message for the next user prompt, which makes slash commands look silent.
    pi.sendMessage({ customType: MESSAGE_TYPE, content, display: true, details });
    return;
  }
  ctx.ui?.notify?.(content, "info");
}

async function refreshFooter(ctx: CommandContext, force = false): Promise<void> {
  const cached = await readCachedSnapshot();
  if (cached) setFooterStatus(ctx, cached);
  const snapshot = await getCodexUsage({ maxAgeMs: CACHE_TTL_MS, noCache: force }).catch(() => undefined);
  if (snapshot) setFooterStatus(ctx, snapshot);
}

function parseCommandArgs(args: string): { kind: "status" | "json" | "raw" | "statusline"; refresh: boolean } {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  let kind: "status" | "json" | "raw" | "statusline" = "status";
  let refresh = false;
  for (const part of parts) {
    if (part === "json" || part === "raw" || part === "statusline" || part === "status") kind = part;
    else if (part === "refresh" || part === "--refresh" || part === "-r") refresh = true;
    else throw new Error(`Unknown /status argument: ${part}`);
  }
  return { kind, refresh };
}

export default function codexUsageExtension(pi: PiApi): void {
  const command = {
    description: "Show ChatGPT Codex quota/limits (5h, weekly, credits)",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "status", label: "status", description: "Boxed summary" },
        { value: "json", label: "json", description: "Normalized JSON" },
        { value: "raw", label: "raw", description: "Raw backend response" },
        { value: "statusline", label: "statusline", description: "Compact one-line output" },
        { value: "refresh", label: "refresh", description: "Bypass cache" },
      ];
      const filtered = items.filter((item) => item.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args: string, ctx: CommandContext) => {
      let parsed: ReturnType<typeof parseCommandArgs>;
      try {
        parsed = parseCommandArgs(args);
      } catch (error) {
        ctx.ui?.notify?.(error instanceof Error ? error.message : String(error), "error");
        return;
      }

      try {
        const snapshot = await getCodexUsage({
          maxAgeMs: CACHE_TTL_MS,
          noCache: parsed.refresh || parsed.kind === "raw",
          includeRaw: parsed.kind === "raw",
        });
        setFooterStatus(ctx, snapshot);
        emitStatus(pi, ctx, messageFor(parsed.kind, snapshot), snapshot);
      } catch (error) {
        ctx.ui?.notify?.(`Codex usage unavailable: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  };

  pi.registerCommand("status", command);
  pi.registerCommand("codex-status", command);

  pi.on("session_start", (_event, ctx) => {
    void refreshFooter(ctx);
  });

  pi.on("after_provider_response", async (event, ctx) => {
    const parsed = parseCodexRateLimitHeaders(event.headers ?? {});
    if (!parsed) return;
    const cached = await readCachedSnapshot();
    const merged = mergeSnapshots(cached, parsed);
    await writeCachedSnapshot(merged).catch(() => undefined);
    setFooterStatus(ctx, merged);
  });
}

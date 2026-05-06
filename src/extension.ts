import { Text } from "@mariozechner/pi-tui";
import { readCachedSnapshot, writeCachedSnapshot } from "./cache.js";
import { formatJson, formatStatus, formatStatusline } from "./format.js";
import { parseCodexRateLimitHeaders } from "./rate-limits.js";
import type { CodexUsageSnapshot, RateLimit } from "./types.js";
import { getCodexUsage } from "./usage.js";

type ThemeLike = {
  fg?: (name: string, text: string) => string;
  bold?: (text: string) => string;
};

type CommandContext = {
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: "info" | "warning" | "error" | "success") => void;
    setStatus?: (key: string, text?: string) => void;
    theme?: ThemeLike;
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
  registerMessageRenderer?: (
    customType: string,
    renderer: (message: { content: string; details?: unknown }, options: unknown, theme: ThemeLike) => Text,
  ) => void;
  sendMessage?: (
    message: { customType: string; content: string; display: boolean; details?: unknown },
    options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
  ) => void;
};

type StatusMessageDetails = {
  kind: "status" | "json" | "raw" | "statusline";
  snapshot: CodexUsageSnapshot;
};

const STATUS_KEY = "codex-status";
const MESSAGE_TYPE = "codex-status";
const CACHE_TTL_MS = 60_000;

function getUi(ctx: CommandContext): CommandContext["ui"] | undefined {
  try {
    return ctx.ui;
  } catch {
    // Pi invalidates extension contexts after reload/session shutdown. Background refreshes
    // can finish after that boundary; treat stale UI access as a no-op.
    return undefined;
  }
}

function dim(ctx: CommandContext, text: string): string {
  const ui = getUi(ctx);
  return ui?.theme?.fg ? ui.theme.fg("dim", text) : text;
}

function setFooterStatus(ctx: CommandContext, snapshot: CodexUsageSnapshot | undefined): void {
  const ui = getUi(ctx);
  if (!ui?.setStatus) return;
  if (!snapshot) {
    ui.setStatus(STATUS_KEY, undefined);
    return;
  }
  ui.setStatus(STATUS_KEY, dim(ctx, formatStatusline(snapshot)));
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
  if (kind === "json") return formatJson(snapshot);
  if (kind === "raw") return JSON.stringify(snapshot.raw ?? snapshot, null, 2);
  if (kind === "statusline") return formatStatusline(snapshot);
  return formatStatus(snapshot);
}

function unfence(content: string): string {
  return content.replace(/^```(?:json)?\n/, "").replace(/\n```$/, "");
}

function color(theme: ThemeLike, name: string, text: string): string {
  try {
    return theme.fg?.(name, text) ?? text;
  } catch {
    return text;
  }
}

function bold(theme: ThemeLike, text: string): string {
  try {
    return theme.bold?.(text) ?? text;
  } catch {
    return text;
  }
}

function colorForLeftPercent(leftPercent: number): "success" | "warning" | "error" {
  if (leftPercent >= 60) return "success";
  if (leftPercent >= 25) return "warning";
  return "error";
}

function colorizeStatusLine(line: string, theme: ThemeLike): string {
  let out = line;

  const barMatch = line.match(/(\[[█░]+\])\s+(\d+(?:\.\d+)?)% left/);
  if (barMatch?.[1] && barMatch[2]) {
    const barText = barMatch[1];
    const pctText = barMatch[2];
    const leftPercent = Number(pctText);
    const statusColor = colorForLeftPercent(Number.isFinite(leftPercent) ? leftPercent : 0);
    out = out.replace(barText, color(theme, statusColor, barText));
    out = out.replace(`${pctText}% left`, color(theme, statusColor, `${pctText}% left`));
  }

  out = out.replace(">_ Codex usage", color(theme, "accent", bold(theme, ">_ Codex usage")));
  out = out.replace(/(Account|Updated|5h limit|Weekly limit|Credits):/g, (label) =>
    color(theme, "muted", label),
  );
  out = out.replace(/(Visit https:\/\/chatgpt\.com\/codex\/settings\/usage for up-to-date|information on rate limits and credits)/g, (text) =>
    color(theme, "dim", text),
  );
  out = out.replace(/(GPT-[^:]+ limit:)/g, (text) => color(theme, "accent", bold(theme, text)));

  if (out.startsWith("╭") || out.startsWith("╰")) return color(theme, "dim", out);
  if (out.startsWith("│") && out.endsWith("│")) {
    return `${color(theme, "dim", out[0] ?? "")}${out.slice(1, -1)}${color(theme, "dim", out.at(-1) ?? "")}`;
  }
  return out;
}

function colorizeStatusText(content: string, theme: ThemeLike): string {
  return unfence(content)
    .split("\n")
    .map((line) => colorizeStatusLine(line, theme))
    .join("\n");
}

function renderStatusMessage(message: { content: string; details?: unknown }, _options: unknown, theme: ThemeLike): Text {
  return new Text(colorizeStatusText(message.content, theme), 0, 0);
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
  pi.registerMessageRenderer?.(MESSAGE_TYPE, renderStatusMessage);

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
        emitStatus(pi, ctx, messageFor(parsed.kind, snapshot), { kind: parsed.kind, snapshot } satisfies StatusMessageDetails);
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

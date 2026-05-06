#!/usr/bin/env node
import { readCachedSnapshot } from "./cache.js";
import { formatJson, formatStatus, formatStatusline } from "./format.js";
import { getCodexUsage } from "./usage.js";
import type { AuthSource, CacheOptions } from "./types.js";

const VERSION = "0.1.0";

interface CliOptions extends CacheOptions {
  command: "status" | "json" | "raw" | "statusline" | "help" | "version";
}

function usage(): string {
  return `pi-codex-status ${VERSION}

Usage:
  pi-codex-status [status] [options]
  pi-codex-status json [options]
  pi-codex-status raw [options]
  pi-codex-status statusline [options]

Commands:
  status      Show a Codex-style quota summary (default)
  json        Print normalized JSON for scripts/extensions
  raw         Print the raw ChatGPT backend usage response
  statusline  Print one compact self-cached line

Options:
  --auth-source <auto|pi|codex>  Auth file preference (default: auto, pi first)
  --auth-file <path>             Read a specific auth.json
  --endpoint <url>               Usage endpoint (default: /backend-api/codex/usage)
  --cache-file <path>            Cache path (default: ~/.cache/pi-codex-status/usage.json)
  --max-age <seconds>            Cache TTL (default: 60; statusline uses cache on failures)
  --no-cache                     Always fetch fresh data
  --timeout <seconds>            HTTP timeout (default: 15)
  --no-box                       Status output without a Unicode border
  -h, --help                     Show this help
  -v, --version                  Show version
`;
}

function takeValue(args: string[], index: number, flag: string): [string, number] {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${flag} requires a value`);
  return [value, index + 1];
}

function parseArgs(argv: string[]): CliOptions & { box: boolean } {
  let command: CliOptions["command"] = "status";
  const options: CliOptions & { box: boolean } = { command, box: true };

  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) {
    const first = args.shift();
    if (first === "status" || first === "json" || first === "raw" || first === "statusline") {
      command = first;
      options.command = command;
    } else if (first === "help") {
      options.command = "help";
    } else {
      throw new Error(`Unknown command: ${first}`);
    }
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") options.command = "help";
    else if (arg === "-v" || arg === "--version") options.command = "version";
    else if (arg === "--no-cache") options.noCache = true;
    else if (arg === "--no-box") options.box = false;
    else if (arg === "--auth-source") {
      const [value, next] = takeValue(args, i, arg);
      if (value !== "auto" && value !== "pi" && value !== "codex") {
        throw new Error("--auth-source must be auto, pi, or codex");
      }
      options.authSource = value as AuthSource;
      i = next;
    } else if (arg === "--auth-file") {
      const [value, next] = takeValue(args, i, arg);
      options.authFile = value;
      i = next;
    } else if (arg === "--endpoint") {
      const [value, next] = takeValue(args, i, arg);
      options.endpoint = value;
      i = next;
    } else if (arg === "--cache-file") {
      const [value, next] = takeValue(args, i, arg);
      options.cacheFile = value;
      i = next;
    } else if (arg === "--max-age") {
      const [value, next] = takeValue(args, i, arg);
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error("--max-age must be a non-negative number");
      options.maxAgeMs = seconds * 1000;
      i = next;
    } else if (arg === "--timeout") {
      const [value, next] = takeValue(args, i, arg);
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("--timeout must be a positive number");
      options.timeoutMs = seconds * 1000;
      i = next;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "help") {
    process.stdout.write(usage());
    return;
  }
  if (options.command === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  try {
    const includeRaw = options.command === "raw";
    const snapshot = await getCodexUsage({ ...options, includeRaw, noCache: options.noCache || includeRaw });
    if (options.command === "json") {
      process.stdout.write(`${formatJson(snapshot)}\n`);
    } else if (options.command === "raw") {
      process.stdout.write(`${JSON.stringify(snapshot.raw ?? snapshot, null, 2)}\n`);
    } else if (options.command === "statusline") {
      process.stdout.write(`${formatStatusline(snapshot)}\n`);
    } else {
      process.stdout.write(`${formatStatus(snapshot, { box: options.box })}\n`);
    }
  } catch (error) {
    if (options.command === "statusline") {
      const cached = await readCachedSnapshot(options.cacheFile);
      if (cached) {
        process.stdout.write(`${formatStatusline({ ...cached, source: "cache" })}\n`);
        return;
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`pi-codex-status: ${message}\n`);
    process.exitCode = 1;
  }
}

await run();

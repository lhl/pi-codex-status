const USAGE_URL = "https://chatgpt.com/codex/settings/usage";
function pct(value) {
    if (value === undefined || !Number.isFinite(value))
        return "?%";
    return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}
function padLabel(label, width = 28) {
    return `${label}:`.padEnd(width, " ");
}
function formatTime(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function sameLocalDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatReset(resetAt, now = new Date()) {
    if (!resetAt)
        return "";
    const reset = new Date(resetAt * 1000);
    if (!Number.isFinite(reset.getTime()))
        return "";
    const time = formatTime(reset);
    if (sameLocalDay(reset, now))
        return `resets ${time}`;
    const date = `${reset.getDate()} ${MONTHS[reset.getMonth()]}`;
    if (reset.getFullYear() === now.getFullYear())
        return `resets ${time} on ${date}`;
    return `resets ${time} on ${date} ${reset.getFullYear()}`;
}
export function formatDuration(seconds) {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0)
        return "";
    const rounded = Math.round(seconds);
    const days = Math.floor(rounded / 86_400);
    const hours = Math.floor((rounded % 86_400) / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    if (days > 0)
        return `${days}d${hours ? ` ${hours}h` : ""}`;
    if (hours > 0)
        return `${hours}h${minutes ? `${minutes}m` : ""}`;
    return `${minutes || 1}m`;
}
export function bar(leftPercent, width = 20) {
    const left = Math.max(0, Math.min(100, leftPercent ?? 0));
    const filled = Math.max(0, Math.min(width, Math.round((left / 100) * width)));
    return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}
function formatWindow(label, window, now) {
    if (!window)
        return undefined;
    const reset = formatReset(window.resetAt, now) || (formatDuration(window.resetAfterSeconds) ? `resets in ${formatDuration(window.resetAfterSeconds)}` : "");
    const suffix = reset ? ` (${reset})` : "";
    return `${padLabel(label)}${bar(window.leftPercent)} ${pct(window.leftPercent)} left${suffix}`;
}
function formatCredits(snapshot) {
    const credits = snapshot.credits;
    if (!credits)
        return undefined;
    if (credits.unlimited)
        return `${padLabel("Credits")}unlimited`;
    if (credits.balance !== undefined) {
        const value = Number(credits.balance);
        const shown = Number.isFinite(value) ? Math.floor(value).toLocaleString() : credits.balance;
        return `${padLabel("Credits")}${shown} credits`;
    }
    if (credits.hasCredits)
        return `${padLabel("Credits")}available`;
    return undefined;
}
function addLimitLines(lines, limit, now, nested = false) {
    if (nested)
        lines.push(`${limit.name} limit:`);
    const primary = formatWindow(nested ? "  5h limit" : "5h limit", limit.primary, now);
    const secondary = formatWindow(nested ? "  Weekly limit" : "Weekly limit", limit.secondary, now);
    if (primary)
        lines.push(primary);
    if (secondary)
        lines.push(secondary);
    if (!primary && !secondary)
        lines.push(`${padLabel(nested ? `  ${limit.name}` : limit.name)}no window data`);
}
function contentLines(snapshot, options = {}) {
    const now = options.now ?? new Date();
    const lines = [];
    lines.push(">_ Codex usage");
    lines.push("");
    lines.push(`Visit ${USAGE_URL} for up-to-date`);
    lines.push("information on rate limits and credits");
    lines.push("");
    const accountBits = [];
    if (snapshot.account.email)
        accountBits.push(snapshot.account.email);
    if (snapshot.account.plan)
        accountBits.push(`(${snapshot.account.plan[0]?.toUpperCase()}${snapshot.account.plan.slice(1)})`);
    if (accountBits.length > 0)
        lines.push(`${padLabel("Account")}${accountBits.join(" ")}`);
    if (snapshot.fetchedAt)
        lines.push(`${padLabel("Updated")}${new Date(snapshot.fetchedAt).toLocaleString()}`);
    lines.push("");
    if (snapshot.defaultLimit)
        addLimitLines(lines, snapshot.defaultLimit, now);
    const credits = formatCredits(snapshot);
    if (credits)
        lines.push(credits);
    for (const limit of snapshot.additionalLimits) {
        lines.push("");
        addLimitLines(lines, limit, now, true);
    }
    return lines;
}
function makeBox(lines, requestedWidth) {
    const contentWidth = Math.max(...lines.map((line) => line.length), 1);
    const width = Math.max(contentWidth, requestedWidth ?? 0);
    const top = `╭${"─".repeat(width + 2)}╮`;
    const bottom = `╰${"─".repeat(width + 2)}╯`;
    const body = lines.map((line) => `│ ${line.padEnd(width, " ")} │`);
    return [top, ...body, bottom].join("\n");
}
export function formatStatus(snapshot, options = {}) {
    const lines = contentLines(snapshot, options);
    return options.box === false ? lines.join("\n") : makeBox(lines, options.width);
}
export function formatStatusline(snapshot, now = new Date()) {
    const parts = [];
    const plan = snapshot.account.plan;
    const primary = snapshot.defaultLimit?.primary;
    const secondary = snapshot.defaultLimit?.secondary;
    if (primary)
        parts.push(`5h:${pct(primary.leftPercent)} left`);
    if (secondary)
        parts.push(`7d:${pct(secondary.leftPercent)} left`);
    if (plan)
        parts.push(plan);
    const reset = primary ? formatReset(primary.resetAt, now).replace(/^resets /, "reset:") : "";
    if (reset)
        parts.push(reset);
    if (snapshot.credits?.balance !== undefined) {
        const value = Number(snapshot.credits.balance);
        parts.push(`credits:${Number.isFinite(value) ? Math.floor(value).toLocaleString() : snapshot.credits.balance}`);
    }
    return parts.length > 0 ? `Codex ${parts.join(" ")}` : "Codex usage unavailable";
}
export function formatJson(snapshot) {
    return JSON.stringify(snapshot, null, 2);
}
//# sourceMappingURL=format.js.map
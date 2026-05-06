import { Text } from "@mariozechner/pi-tui";
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
    registerCommand: (name: string, options: {
        description?: string;
        getArgumentCompletions?: (prefix: string) => Array<{
            value: string;
            label: string;
            description?: string;
        }> | null;
        handler: (args: string, ctx: CommandContext) => Promise<void> | void;
    }) => void;
    on: (event: string, handler: (event: any, ctx: CommandContext) => Promise<void> | void) => void;
    registerMessageRenderer?: (customType: string, renderer: (message: {
        content: string;
        details?: unknown;
    }, options: unknown, theme: ThemeLike) => Text) => void;
    sendMessage?: (message: {
        customType: string;
        content: string;
        display: boolean;
        details?: unknown;
    }, options?: {
        triggerTurn?: boolean;
        deliverAs?: "steer" | "followUp" | "nextTurn";
    }) => void;
};
export default function codexUsageExtension(pi: PiApi): void;
export {};

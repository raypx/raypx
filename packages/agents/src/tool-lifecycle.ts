import {
  computerFileResultSchema,
  MAX_COMPUTER_FILE_RESULT_BYTES,
  toolPageSchema,
  webSourcesSchema,
  weatherForecastSchema,
  type WeatherForecast,
  type ToolOutcome,
  type ToolPage,
  type WebSources,
  type ComputerFileResult,
} from "@raypx/core/conversation";
import type { ToolCompletion } from "./conversations.js";

export function toolCompletion(
  toolCallId: string,
  output: string | null,
  fallback: ToolOutcome = "unknown",
  toolName?: string,
): ToolCompletion {
  let outcome = fallback;
  let exitStatus: number | null = null;
  let page: ToolPage | undefined;
  let webSources: WebSources | undefined;
  let weatherForecast: WeatherForecast | undefined;
  let fileResult: ComputerFileResult | undefined;
  try {
    const result = JSON.parse(output ?? "null") as {
      state?: unknown;
      content?: unknown;
      exitStatus?: unknown;
      pageId?: unknown;
      version?: unknown;
      webSources?: unknown;
      weatherForecast?: unknown;
    } | null;
    if (
      result?.state === "succeeded" ||
      result?.state === "failed" ||
      result?.state === "cancelled"
    )
      outcome = result.state;
    if (
      result?.state === "refused" ||
      result?.state === "blocked" ||
      result?.state === "denied" ||
      result?.state === "expired"
    )
      outcome = "refused";
    if (Number.isInteger(result?.exitStatus)) exitStatus = result!.exitStatus as number;
    // This is the server operation's returned value, never model-supplied arguments.
    if (
      outcome === "succeeded" &&
      (toolName === "agent_page_create" || toolName === "agent_page_update")
    ) {
      const parsed = toolPageSchema.safeParse({ id: result?.pageId, version: result?.version });
      if (parsed.success) page = parsed.data;
    }
    if (outcome === "succeeded" && (toolName === "web_search" || toolName === "web_read")) {
      const parsed = webSourcesSchema.safeParse(result?.webSources);
      if (parsed.success && parsed.data.length) webSources = parsed.data;
    }
    if (outcome === "succeeded" && toolName === "weather_forecast") {
      const parsed = weatherForecastSchema.safeParse(result?.weatherForecast);
      if (parsed.success) weatherForecast = parsed.data;
    }
    if (exitStatus === null && typeof result?.content === "string" && !webSources) {
      const content: unknown = JSON.parse(result.content);
      if (
        outcome === "succeeded" &&
        (toolName === "computer_search_files" || toolName === "computer_edit_file")
      ) {
        const parsed = computerFileResultSchema.safeParse(content);
        const kind = toolName === "computer_search_files" ? "search" : "edit";
        if (
          parsed.success &&
          parsed.data.kind === kind &&
          Buffer.byteLength(JSON.stringify(parsed.data), "utf8") <= MAX_COMPUTER_FILE_RESULT_BYTES
        )
          fileResult = parsed.data;
      }
      if (
        typeof content === "object" &&
        content !== null &&
        "exitStatus" in content &&
        Number.isInteger(content.exitStatus)
      )
        exitStatus = content.exitStatus as number;
    }
  } catch {
    /* Provider text is never copied into lifecycle metadata. */
  }
  return {
    toolCallId,
    outcome,
    exitStatus,
    ...(page ? { page } : {}),
    ...(webSources ? { webSources } : {}),
    ...(weatherForecast ? { weatherForecast } : {}),
    ...(fileResult ? { fileResult } : {}),
  };
}

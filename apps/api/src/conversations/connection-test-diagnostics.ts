import type { AiRequestOptions } from "@raypx/ai";
import {
  modelConnectionDiagnosticTokenSchema,
  type ModelConnectionTestResult,
} from "@raypx/core/model-connections";
import { protectedInputVariants } from "@raypx/core/protected-input";

const maxErrorBytes = 16_384;
const requestIdHeaders = ["x-request-id", "request-id", "x-zhipu-request-id"];

function object(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
}

async function readErrorBody(response: Response): Promise<unknown> {
  const reader = response.clone().body?.getReader();
  if (!reader) return undefined;
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxErrorBytes) return undefined;
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    // The SDK still owns the other branch of this response.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Collect only bounded diagnostics for this connection test. */
export function observeConnectionTest(secret: string) {
  const protectedValues = protectedInputVariants(secret);
  const details: Pick<ModelConnectionTestResult, "providerCode" | "providerRequestId"> = {};
  function token(value: unknown) {
    const parsed = modelConnectionDiagnosticTokenSchema.safeParse(value);
    if (parsed.success && !protectedValues.some((variant) => parsed.data.includes(variant)))
      return parsed.data;
  }
  function record(value: unknown, failedResponse = false) {
    const message = object(value);
    const response = object(message?.response);
    const error = object(message?.error) ?? object(response?.error);
    if (
      !failedResponse &&
      !error &&
      message?.type !== "error" &&
      message?.type !== "response.failed"
    )
      return;
    const code = error?.code ?? message?.code ?? error?.type;
    const providerCode = token(Number.isSafeInteger(code) ? String(code) : code);
    const providerRequestId = token(
      message?.request_id ?? response?.request_id ?? error?.request_id,
    );
    if (providerCode) details.providerCode = providerCode;
    if (providerRequestId) details.providerRequestId = providerRequestId;
  }
  const options: Pick<AiRequestOptions, "fetch" | "onProviderStreamEvent"> = {
    fetch: Object.assign(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const response = await globalThis.fetch(input, init);
        for (const header of requestIdHeaders) {
          const requestId = token(response.headers.get(header));
          if (requestId) {
            details.providerRequestId = requestId;
            break;
          }
        }
        if (!response.ok) {
          try {
            record(await readErrorBody(response), true);
          } catch {
            // A response without usable diagnostics still reaches the SDK.
          }
        }
        return response;
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
    onProviderStreamEvent: (event) => record(event),
  };
  return { options, details };
}

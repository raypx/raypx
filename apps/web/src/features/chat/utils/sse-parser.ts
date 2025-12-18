export interface SSEParserCallbacks {
  onChunk?: (content: string) => void;
  onThinking?: (content: string) => void;
  onSources?: (sources: unknown) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: SSEParserCallbacks,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | null = null;
  let currentData: string | null = null;
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      // Handle event type
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
        continue;
      }

      // Handle data line
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (currentData === null) {
          currentData = data;
        } else {
          currentData += `\n${data}`;
        }
        continue;
      }

      // Empty line indicates end of event block
      if (line === "") {
        if (currentEvent && currentData !== null) {
          try {
            const data = currentData.trim();
            if (!data) {
              currentEvent = null;
              currentData = null;
              continue;
            }

            const parsed = JSON.parse(data);

            // Handle different event types
            if (currentEvent === "chunk" && parsed.content !== undefined) {
              callbacks.onChunk?.(parsed.content);
            } else if (currentEvent === "thinking" && parsed.content !== undefined) {
              callbacks.onThinking?.(parsed.content);
            } else if (currentEvent === "sources" && parsed.sources) {
              callbacks.onSources?.(parsed.sources);
            } else if (currentEvent === "error") {
              callbacks.onError?.(parsed.message || "Streaming error occurred");
              streamDone = true;
              break;
            } else if (currentEvent === "done") {
              callbacks.onDone?.();
              streamDone = true;
              break;
            }
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            callbacks.onError?.(`Failed to parse stream data: ${errorMessage}`);
          }
        }

        currentEvent = null;
        currentData = null;

        if (streamDone) {
          break;
        }
      }
    }
  }
}

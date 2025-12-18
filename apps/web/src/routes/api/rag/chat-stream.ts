/**
 * SSE endpoint for streaming chat responses
 * POST /api/rag/chat-stream
 */

import { chatWithDocumentStream } from "@raypx/rag";
import { createTRPCContext } from "@raypx/trpc";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { z } from "zod/v4";

const ChatStreamRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string().trim().min(1).max(2000),
    }),
  ),
  documentId: z.string().optional(),
  datasetId: z.string().optional(),
  maxChunks: z.number().int().min(1).max(20).default(5),
  similarityThreshold: z.number().min(0).max(1).default(0.6),
  systemPrompt: z.string().max(1000).optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(100).max(4000).default(2000),
  llmProvider: z.enum(["aliyun", "openai", "deepseek"]).optional(),
  llmModel: z.string().optional(),
  conversationId: z.string().optional(),
  saveHistory: z.boolean().optional(),
});

async function handler({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Parse request body
    const body = await request.json();
    const input = ChatStreamRequestSchema.parse(body);

    // Create tRPC context to get user session
    const ctx = await createTRPCContext({
      headers: request.headers,
    });

    if (!ctx.session?.user?.id) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = ctx.session.user.id;

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Send initial event
        const sendEvent = (event: string, data: unknown) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          // Call streaming chat function
          await chatWithDocumentStream(
            input.messages,
            userId,
            {
              documentId: input.documentId,
              datasetId: input.datasetId,
              maxChunks: input.maxChunks,
              similarityThreshold: input.similarityThreshold,
              systemPrompt: input.systemPrompt,
              temperature: input.temperature,
              maxTokens: input.maxTokens,
              llmProvider: input.llmProvider,
              llmModel: input.llmModel,
              conversationId: input.conversationId,
              saveHistory: input.saveHistory,
            },
            {
              onChunk: (chunk: string) => {
                sendEvent("chunk", { content: chunk });
              },
              onThinking: (thinking: string) => {
                sendEvent("thinking", { content: thinking });
              },
              onSources: (sources: unknown[]) => {
                sendEvent("sources", { sources });
              },
              onError: (error: Error) => {
                sendEvent("error", { message: error.message });
                controller.close();
              },
              onComplete: () => {
                sendEvent("done", {});
                controller.close();
              },
            },
          );
        } catch (error) {
          sendEvent("error", {
            message: error instanceof Error ? error.message : "Unknown error",
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    return json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/rag/chat-stream")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});

import { createHash } from "node:crypto";
import { join } from "node:path";
import type { CloudApplication } from "@voidmix/application";
import type { CloudRun, CloudAssetVersion, ObjectStorage } from "@voidmix/core";
import type { TrustedAiTool } from "@voidmix/ai";
import { computeTable, extractFile, type TableData, type Cell } from "./files.js";
import {
  renderReport,
  renderTable,
  renderDeck,
  type GeneratedFile,
  type RendererOptions,
} from "./render.js";
import { readPublicSource, searchWeb } from "./network.js";
import { validateCitations } from "./citations.js";
import { CloudExecutionError, publicFailureCode } from "../errors.js";

export interface ToolContext {
  tables: Map<string, TableData>;
  sources: Map<string, { id: string; url: string; title: string; excerpt: string }>;
  assets: Map<string, CloudAssetVersion>;
  generatedAssetIds: Set<string>;
}
export interface ToolHost {
  app: Pick<
    CloudApplication,
    "workerControl" | "appendEvent" | "createWorkerAsset" | "completeWorkerAsset"
  >;
  storage: ObjectStorage | null;
  run: CloudRun;
  ownerId: string;
  epoch: number;
  executionId: string;
  context: ToolContext;
  renderer: RendererOptions;
  searchApiKey?: string;
  research?: {
    search(
      query: string,
      signal?: AbortSignal,
    ): Promise<{ url: string; title: string; excerpt: string }[]>;
    read(url: string, signal?: AbortSignal): Promise<{ url: string; title: string; text: string }>;
  };
  delegate?: (
    tasks: { role: string; prompt: string }[],
  ) => Promise<{ executionId: string; output: string }[]>;
}
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Tool input must be an object.");
  return value as Record<string, unknown>;
};
const string = (value: unknown, max = 100_000): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("Tool text is invalid or exceeds limits.");
  return value;
};
const list = (value: unknown, max = 100): unknown[] => {
  if (!Array.isArray(value) || value.length > max)
    throw new Error("Tool list is invalid or exceeds limits.");
  return value;
};
const schema = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const textSchema = { type: "string", minLength: 1 };
const arraySchema = (items: unknown, maxItems = 100) => ({ type: "array", items, maxItems });
const sectionSchema = schema({ heading: textSchema, body: textSchema }, ["heading", "body"]);

export function createTrustedTools(host: ToolHost): TrustedAiTool[] {
  const fence = { runId: host.run.id, ownerId: host.ownerId, epoch: host.epoch };
  const files = async (assetId: string) => {
    const asset = host.context.assets.get(assetId);
    if (!asset || (!asset.published && !(asset.verifiedAt && asset.runId === host.run.id)))
      throw new Error("File reference is not authorized for this execution.");
    if (!host.storage)
      throw new CloudExecutionError("STORAGE_UNAVAILABLE", "File storage is unavailable.");
    const stored = await host.storage.read(asset.objectKey);
    if (!stored) throw new Error("File content is unavailable.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of stored.body) {
      size += chunk.byteLength;
      if (size > 10 * 1024 * 1024) throw new Error("File exceeds limit.");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (
      size !== asset.byteSize ||
      createHash("sha256").update(bytes).digest("hex") !== asset.checksum
    )
      throw new Error("File checksum verification failed.");
    return { asset, bytes };
  };
  const upload = async (generated: GeneratedFile[], callId: string) => {
    if (!host.storage)
      throw new CloudExecutionError(
        "STORAGE_UNAVAILABLE",
        "Document export is unavailable: object storage is not configured.",
      );
    const result: CloudAssetVersion[] = [];
    for (const [index, file] of generated.entries()) {
      host.renderer.signal?.throwIfAborted();
      const checksum = createHash("sha256").update(file.body).digest("hex");
      const asset = await host.app.createWorkerAsset({
        ...fence,
        name: file.name,
        mediaType: file.mediaType,
        byteSize: file.body.byteLength,
        checksum,
        idempotencyKey: `tool:${callId}:${index}`,
      });
      await host.storage.put({
        key: asset.objectKey,
        body: file.body,
        contentType: file.mediaType,
        checksumSha256: checksum,
      });
      const metadata = await host.storage.head(asset.objectKey);
      if (
        !metadata ||
        metadata.byteSize !== asset.byteSize ||
        metadata.checksumSha256 !== asset.checksum ||
        metadata.contentType !== asset.mediaType
      )
        throw new Error("Exported object verification failed.");
      const completed = await host.app.completeWorkerAsset({
        ...fence,
        assetVersionId: asset.id,
        byteSize: metadata.byteSize,
        checksum: metadata.checksumSha256,
      });
      result.push(completed);
    }
    host.renderer.signal?.throwIfAborted();
    for (const asset of result) {
      host.context.assets.set(asset.id, asset);
      host.context.generatedAssetIds.add(asset.id);
    }
    return result.map((asset) => ({
      assetVersionId: asset.id,
      name: asset.name,
      mediaType: asset.mediaType,
      byteSize: asset.byteSize,
    }));
  };
  const tools: TrustedAiTool[] = [
    {
      name: "search",
      description:
        "Search public web sources. Returns evidence ids, links and excerpts. Search is unavailable when its provider is not configured.",
      parameters: schema({ query: textSchema }, ["query"]),
      async execute(input, context) {
        const args = object(input);
        const results = host.research
          ? await host.research.search(string(args.query, 2000), context.signal)
          : await searchWeb(string(args.query, 2000), {
              ...(host.searchApiKey ? { apiKey: host.searchApiKey } : {}),
              ...(context.signal ? { signal: context.signal } : {}),
            });
        for (const result of results) {
          const source = { ...result, id: crypto.randomUUID() };
          host.context.sources.set(source.id, source);
          await host.app.appendEvent({
            ...fence,
            eventId: crypto.randomUUID(),
            type: "source.created",
            executionId: host.executionId,
            payload: source,
          });
        }
        return results.map((result) =>
          [...host.context.sources.values()].find((source) => source.url === result.url),
        );
      },
    },
    {
      name: "read_source",
      description:
        "Read text from a public HTTP(S) source without running scripts. Internal network access is forbidden.",
      parameters: schema({ url: textSchema }, ["url"]),
      async execute(input, context) {
        const result = host.research
          ? await host.research.read(string(object(input).url, 4096), context.signal)
          : await readPublicSource(string(object(input).url, 4096), context.signal);
        const source = {
          id: crypto.randomUUID(),
          url: result.url,
          title: result.title,
          excerpt: result.text.slice(0, 2000),
        };
        host.context.sources.set(source.id, source);
        await host.app.appendEvent({
          ...fence,
          eventId: crypto.randomUUID(),
          type: "source.created",
          executionId: host.executionId,
          payload: source,
        });
        return { ...source, text: result.text };
      },
    },
    {
      name: "extract_file",
      description:
        "Extract an authorized CSV, XLSX, Markdown, TXT or text-layer PDF. Table data stays in trusted memory; returns table ids and a bounded preview.",
      parameters: schema({ assetVersionId: textSchema }, ["assetVersionId"]),
      async execute(input) {
        const { asset, bytes } = await files(string(object(input).assetVersionId, 200));
        const extracted = await extractFile(bytes, asset.mediaType, asset.name, host.renderer);
        return {
          text: extracted.text,
          tables: extracted.tables.map((table) => {
            const tableId = crypto.randomUUID();
            host.context.tables.set(tableId, table);
            return {
              tableId,
              name: table.name,
              columns: table.columns,
              rowCount: table.rows.length,
              preview: table.rows.slice(0, 30),
              notes: table.notes,
            };
          }),
        };
      },
    },
    {
      name: "compute_table",
      description:
        "Perform trusted numeric summary, equality filter, or grouped sum on an extracted table. This tool cannot execute code or formulas.",
      parameters: schema(
        {
          tableId: textSchema,
          operation: { type: "string", enum: ["summary", "group_sum", "filter"] },
          column: textSchema,
          groupBy: textSchema,
          equals: {
            anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }],
          },
        },
        ["tableId", "operation", "column"],
      ),
      async execute(input) {
        const args = object(input);
        const table = host.context.tables.get(string(args.tableId, 200));
        if (!table) throw new Error("Table reference is unavailable.");
        const operation = string(args.operation, 30);
        if (!["summary", "group_sum", "filter"].includes(operation))
          throw new Error("Table operation is unsupported.");
        const equals = args.equals;
        if (
          equals !== undefined &&
          equals !== null &&
          !["string", "number", "boolean"].includes(typeof equals)
        )
          throw new Error("Filter value is unsupported.");
        const computed = computeTable(table, {
          operation: operation as "summary" | "group_sum" | "filter",
          column: string(args.column, 200),
          ...(args.groupBy ? { groupBy: string(args.groupBy, 200) } : {}),
          ...(equals === undefined ? {} : { equals: equals as Cell }),
        });
        const tableId = crypto.randomUUID();
        host.context.tables.set(tableId, computed);
        return {
          tableId,
          columns: computed.columns,
          rowCount: computed.rows.length,
          preview: computed.rows.slice(0, 30),
          notes: computed.notes,
        };
      },
    },
  ];
  if (host.run.mode === "computer")
    tools.push(
      {
        name: "render_report",
        description:
          "Generate a real Markdown report and PDF with verified source references. Missing font/storage makes export unavailable.",
        parameters: schema(
          {
            title: textSchema,
            sections: arraySchema(sectionSchema),
            sourceIds: arraySchema(textSchema),
          },
          ["title", "sections"],
        ),
        async execute(input, context) {
          const args = object(input);
          const sections = list(args.sections).map((item) => {
            const section = object(item);
            return { heading: string(section.heading, 300), body: string(section.body, 100_000) };
          });
          const sources =
            args.sourceIds === undefined
              ? [...host.context.sources.values()]
              : list(args.sourceIds).map((value) => {
                  const source = host.context.sources.get(string(value, 200));
                  if (!source) throw new Error("Report source reference is unavailable.");
                  return source;
                });
          validateCitations(
            [
              string(args.title, 300),
              ...sections.map((section) => `${section.heading}\n${section.body}`),
            ].join("\n"),
            sources,
          );
          const generated = await renderReport(
            { title: string(args.title, 300), sections, sources },
            host.renderer,
          );
          return upload(generated, context.callId);
        },
      },
      {
        name: "render_table",
        description:
          "Generate an XLSX workbook and CSV per sheet from extracted/computed table ids, retaining actual values and cached-formula notes.",
        parameters: schema({ title: textSchema, tableIds: arraySchema(textSchema, 20) }, [
          "title",
          "tableIds",
        ]),
        async execute(input, context) {
          const args = object(input);
          const tables = list(args.tableIds, 20).map((value) => {
            const table = host.context.tables.get(string(value, 200));
            if (!table) throw new Error("Table reference is unavailable.");
            return table;
          });
          return upload(await renderTable(string(args.title, 300), tables), context.callId);
        },
      },
      {
        name: "render_deck",
        description:
          "Generate real PPTX and PDF preview from fixed slide templates. LibreOffice conversion and PDF page verification are required.",
        parameters: schema(
          {
            title: textSchema,
            slides: arraySchema(
              schema(
                { title: textSchema, bullets: arraySchema(textSchema, 8), notes: textSchema },
                ["title", "bullets"],
              ),
              30,
            ),
          },
          ["title", "slides"],
        ),
        async execute(input, context) {
          const args = object(input);
          const slides = list(args.slides, 30).map((item) => {
            const slide = object(item);
            return {
              title: string(slide.title, 160),
              bullets: list(slide.bullets, 8).map((bullet) => string(bullet, 500)),
              ...(slide.notes ? { notes: string(slide.notes, 10_000) } : {}),
            };
          });
          const title = string(args.title, 300);
          validateCitations(
            [
              title,
              ...slides.flatMap((slide) => [slide.title, ...slide.bullets, slide.notes ?? ""]),
            ].join("\n"),
            host.context.sources.values(),
          );
          return upload(
            await renderDeck(
              { title, slides },
              { ...host.renderer, directory: join(host.renderer.directory, context.callId) },
            ),
            context.callId,
          );
        },
      },
    );
  if (host.delegate)
    tools.push({
      name: "delegate",
      description:
        "Delegate 1–2 independent research or production subtasks to parallel child agents. Children cannot delegate and share this task's budget and permissions.",
      parameters: schema(
        {
          tasks: arraySchema(
            schema({ role: textSchema, prompt: textSchema }, ["role", "prompt"]),
            2,
          ),
        },
        ["tasks"],
      ),
      async execute(input) {
        const tasks = list(object(input).tasks, 2).map((value) => {
          const task = object(value);
          return { role: string(task.role, 80), prompt: string(task.prompt, 20_000) };
        });
        if (!tasks.length) throw new Error("Delegation requires at least one task.");
        return host.delegate!(tasks);
      },
    });
  return tools.map((tool) => ({
    ...tool,
    async execute(input, context) {
      try {
        const snapshot = await host.app.workerControl(fence);
        context.signal?.throwIfAborted();
        if (snapshot.run.cancelRequested) throw new CloudExecutionError("EXECUTION_FAILED");
        return await tool.execute(input, context);
      } catch (error) {
        throw new CloudExecutionError(publicFailureCode(error));
      }
    },
  }));
}

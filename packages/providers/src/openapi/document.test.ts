import { expect, it } from "vitest";
import { matchesOpenApiSchema, parseOpenApiDocument } from "./document.js";
function document(operation: Record<string, unknown> = { operationId: "getItem" }) {
  return JSON.stringify({ openapi: "3.1.0", paths: { "/items": { get: operation } } });
}
it("parses bounded JSON/YAML with safe local refs, operation labels and method classification", () => {
  const [read] = parseOpenApiDocument(
    document({
      operationId: "getItem",
      summary: "Read item",
      parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1 } }],
    }),
  );
  expect(read).toMatchObject({
    method: "GET",
    readOnly: true,
    label: "Read item",
    inputSchema: { additionalProperties: false },
  });
  expect(matchesOpenApiSchema({ query: { limit: 2 } }, read!.inputSchema)).toBe(true);
  expect(matchesOpenApiSchema({ query: { limit: -1 } }, read!.inputSchema)).toBe(false);
  expect(matchesOpenApiSchema({ headers: { authorization: "value" } }, read!.inputSchema)).toBe(
    false,
  );
  expect(
    parseOpenApiDocument(
      "openapi: 3.0.3\npaths:\n  /items:\n    post:\n      operationId: createItem\n",
    )[0],
  ).toMatchObject({ method: "POST", readOnly: false });
});
it("refuses external/recursive refs, unsupported schema composition and malformed path parameters", () => {
  expect(() =>
    parseOpenApiDocument(
      document({ operationId: "read", parameters: [{ $ref: "https://outside.test/schema" }] }),
    ),
  ).toThrow("UNSUPPORTED_SCHEMA");
  expect(() =>
    parseOpenApiDocument(
      document({
        operationId: "read",
        parameters: [{ name: "x", in: "query", schema: { anyOf: [] } }],
      }),
    ),
  ).toThrow("UNSUPPORTED_SCHEMA");
  expect(() =>
    parseOpenApiDocument(
      JSON.stringify({ openapi: "3.0.0", paths: { "/{id}": { get: { operationId: "get" } } } }),
    ),
  ).toThrow("INVALID_DOCUMENT");
  expect(() =>
    parseOpenApiDocument(
      JSON.stringify({
        openapi: "3.1.0",
        paths: {
          "/": {
            post: {
              operationId: "write",
              requestBody: {
                content: { "application/json": { schema: { $ref: "#/components/schemas/loop" } } },
              },
            },
          },
        },
        components: {
          schemas: {
            loop: { type: "object", properties: { loop: { $ref: "#/components/schemas/loop" } } },
          },
        },
      }),
    ),
  ).toThrow("SCHEMA_DEPTH");
});
it("bounds bytes, operation count, identifiers and schema depth", () => {
  expect(() => parseOpenApiDocument(" ".repeat(262145))).toThrow("DOCUMENT_TOO_LARGE");
  expect(() =>
    parseOpenApiDocument(
      JSON.stringify({
        openapi: "3.0.0",
        paths: Object.fromEntries(
          Array.from({ length: 129 }, (_, index) => [
            `/${index}`,
            { get: { operationId: `read${index}` } },
          ]),
        ),
      }),
    ),
  ).toThrow("OPERATION_LIMIT");
  expect(() => parseOpenApiDocument(document({ operationId: "bad.name" }))).toThrow(
    "INVALID_DOCUMENT",
  );
  expect(() => parseOpenApiDocument(JSON.stringify({ openapi: "2.0", paths: {} }))).toThrow(
    "INVALID_DOCUMENT",
  );
});
it("enforces required bodies, nested object/array constraints and property bounds", () => {
  const schema = {
    type: "object",
    minProperties: 1,
    maxProperties: 2,
    additionalProperties: { type: "array", items: { type: "integer" }, minItems: 1, maxItems: 2 },
  };
  expect(matchesOpenApiSchema({}, schema)).toBe(false);
  expect(matchesOpenApiSchema({ a: [1], b: [2] }, schema)).toBe(true);
  expect(matchesOpenApiSchema({ a: [1], b: [2], c: [3] }, schema)).toBe(false);
  expect(matchesOpenApiSchema({ a: ["wrong"] }, schema)).toBe(false);
});

import { YAML } from "bun";
import type { OpenApiOperation } from "@raypx/core/openapi-servers";
export const MAX_OPENAPI_BYTES = 262144;
export class OpenApiDocumentError extends Error {
  constructor(
    readonly code:
      | "INVALID_DOCUMENT"
      | "DOCUMENT_TOO_LARGE"
      | "OPERATION_LIMIT"
      | "SCHEMA_DEPTH"
      | "UNSUPPORTED_SCHEMA",
  ) {
    super(code);
  }
}
export interface OpenApiParameter {
  name: string;
  in: "path" | "query";
  required: boolean;
  schema: Record<string, unknown>;
}
export interface OpenApiToolOperation extends OpenApiOperation {
  parameters: OpenApiParameter[];
  bodySchema: Record<string, unknown> | null;
  bodyRequired: boolean;
  inputSchema: Record<string, unknown>;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new OpenApiDocumentError("INVALID_DOCUMENT");
  return value as Record<string, unknown>;
}
const METHODS = new Set(["get", "head", "post", "put", "patch", "delete", "options"]);
/** No remote references, executable code, schema compilers or network reads. */
export function parseOpenApiDocument(text: string): OpenApiToolOperation[] {
  if (Buffer.byteLength(text, "utf8") > MAX_OPENAPI_BYTES)
    throw new OpenApiDocumentError("DOCUMENT_TOO_LARGE");
  let document: Record<string, unknown>;
  try {
    document = object(YAML.parse(text));
  } catch {
    throw new OpenApiDocumentError("INVALID_DOCUMENT");
  }
  if (typeof document.openapi !== "string" || !/^3\.(0|1|2)\.\d+$/.test(document.openapi))
    throw new OpenApiDocumentError("INVALID_DOCUMENT");
  let nodes = 0;
  function bounded(value: unknown, depth: number): void {
    if (depth > 24 || ++nodes > 16000) throw new OpenApiDocumentError("SCHEMA_DEPTH");
    if (!value || typeof value !== "object") return;
    for (const child of Object.values(value)) bounded(child, depth + 1);
  }
  bounded(document, 0);
  function resolve(value: unknown, depth = 0): Record<string, unknown> {
    if (depth > 16) throw new OpenApiDocumentError("SCHEMA_DEPTH");
    const row = object(value);
    if (row.$ref === undefined) return row;
    if (typeof row.$ref !== "string" || !row.$ref.startsWith("#/"))
      throw new OpenApiDocumentError("UNSUPPORTED_SCHEMA");
    let target: unknown = document;
    for (const part of row.$ref.slice(2).split("/")) {
      const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
      target = object(target)[key];
    }
    return resolve(target, depth + 1);
  }
  function schema(value: unknown, depth = 0): Record<string, unknown> {
    if (depth > 12) throw new OpenApiDocumentError("SCHEMA_DEPTH");
    const source = resolve(value);
    // A bounded JSON-schema subset. Unsupported composition is rejected rather than silently dropping validation.
    if (
      [
        "allOf",
        "anyOf",
        "oneOf",
        "not",
        "if",
        "then",
        "else",
        "pattern",
        "patternProperties",
        "unevaluatedProperties",
        "$dynamicRef",
      ].some((key) => source[key] !== undefined)
    )
      throw new OpenApiDocumentError("UNSUPPORTED_SCHEMA");
    const result: Record<string, unknown> = {};
    for (const key of [
      "type",
      "enum",
      "const",
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "minProperties",
      "maxProperties",
      "required",
    ]) {
      if (source[key] !== undefined) result[key] = source[key];
    }
    if (source.nullable === true && typeof result.type === "string")
      result.type = [result.type, "null"];
    if (source.properties !== undefined)
      result.properties = Object.fromEntries(
        Object.entries(object(source.properties)).map(([key, item]) => [
          key,
          schema(item, depth + 1),
        ]),
      );
    if (source.items !== undefined) result.items = schema(source.items, depth + 1);
    if (typeof source.additionalProperties === "boolean")
      result.additionalProperties = source.additionalProperties;
    else if (source.additionalProperties !== undefined)
      result.additionalProperties = schema(source.additionalProperties, depth + 1);
    if (!result.type && result.properties) result.type = "object";
    if (
      result.type !== undefined &&
      !(
        typeof result.type === "string" ||
        (Array.isArray(result.type) && result.type.every((item) => typeof item === "string"))
      )
    )
      throw new OpenApiDocumentError("INVALID_DOCUMENT");
    const acceptedTypes = new Set([
      "string",
      "number",
      "integer",
      "boolean",
      "object",
      "array",
      "null",
    ]);
    const types = Array.isArray(result.type) ? result.type : [result.type];
    if (
      result.type !== undefined &&
      types.some((type) => typeof type !== "string" || !acceptedTypes.has(type))
    )
      throw new OpenApiDocumentError("INVALID_DOCUMENT");
    if (
      result.required !== undefined &&
      (!Array.isArray(result.required) ||
        result.required.length > 128 ||
        result.required.some((name) => typeof name !== "string"))
    )
      throw new OpenApiDocumentError("INVALID_DOCUMENT");
    if (
      result.enum !== undefined &&
      (!Array.isArray(result.enum) || !result.enum.length || result.enum.length > 128)
    )
      throw new OpenApiDocumentError("INVALID_DOCUMENT");
    for (const key of [
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "minProperties",
      "maxProperties",
    ])
      if (
        result[key] !== undefined &&
        (typeof result[key] !== "number" || !Number.isSafeInteger(result[key]) || result[key] < 0)
      )
        throw new OpenApiDocumentError("INVALID_DOCUMENT");
    return result;
  }
  const result: OpenApiToolOperation[] = [];
  const ids = new Set<string>();
  for (const [path, rawPath] of Object.entries(object(document.paths))) {
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      /[?#\\]/.test(path) ||
      Array.from(path).some((character) => character.charCodeAt(0) <= 32) ||
      path.split("/").some((part) => part === "." || part === "..") ||
      path.length > 1024
    )
      throw new OpenApiDocumentError("INVALID_DOCUMENT");
    const pathItem = resolve(rawPath);
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!METHODS.has(method)) continue;
      if (result.length === 128) throw new OpenApiDocumentError("OPERATION_LIMIT");
      const operation = object(rawOperation);
      const operationId = operation.operationId;
      if (
        typeof operationId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(operationId) ||
        ids.has(operationId)
      )
        throw new OpenApiDocumentError("INVALID_DOCUMENT");
      ids.add(operationId);
      const parameters = new Map<string, OpenApiParameter>();
      for (const raw of [
        ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
        ...(Array.isArray(operation.parameters) ? operation.parameters : []),
      ]) {
        const param = resolve(raw);
        if (
          (param.in !== "path" && param.in !== "query") ||
          typeof param.name !== "string" ||
          !/^[a-zA-Z0-9_.-]{1,128}$/.test(param.name)
        )
          throw new OpenApiDocumentError("UNSUPPORTED_SCHEMA");
        const itemSchema = schema(param.schema);
        if (!["string", "number", "integer", "boolean"].includes(String(itemSchema.type)))
          throw new OpenApiDocumentError("UNSUPPORTED_SCHEMA");
        parameters.set(`${param.in}:${param.name}`, {
          name: param.name,
          in: param.in,
          required: param.in === "path" || param.required === true,
          schema: itemSchema,
        });
      }
      if (parameters.size > 64) throw new OpenApiDocumentError("INVALID_DOCUMENT");
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      if (
        placeholders.some((name) => !parameters.has(`path:${name}`)) ||
        [...parameters.values()].some(
          (param) => param.in === "path" && !placeholders.includes(param.name),
        )
      )
        throw new OpenApiDocumentError("INVALID_DOCUMENT");
      let bodySchema: Record<string, unknown> | null = null;
      let bodyRequired = false;
      if (operation.requestBody !== undefined) {
        const body = resolve(operation.requestBody);
        bodyRequired = body.required === true;
        const content = object(body.content);
        if (!content["application/json"]) throw new OpenApiDocumentError("UNSUPPORTED_SCHEMA");
        bodySchema = schema(object(content["application/json"]).schema);
        if (method === "get" || method === "head")
          throw new OpenApiDocumentError("INVALID_DOCUMENT");
      }
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const location of ["path", "query"]) {
        const params = [...parameters.values()].filter((param) => param.in === location);
        if (!params.length) continue;
        const requiredNames = params.filter((param) => param.required).map((param) => param.name);
        properties[location] = {
          type: "object",
          properties: Object.fromEntries(params.map((param) => [param.name, param.schema])),
          required: requiredNames,
          additionalProperties: false,
        };
        if (requiredNames.length) required.push(location);
      }
      if (bodySchema) {
        properties.body = bodySchema;
        if (bodyRequired) required.push("body");
      }
      const label =
        typeof operation.summary === "string" && operation.summary.trim()
          ? operation.summary.trim().slice(0, 160)
          : operationId;
      result.push({
        operationId,
        label,
        method: method.toUpperCase() as OpenApiOperation["method"],
        path,
        readOnly: method === "get" || method === "head",
        parameters: [...parameters.values()],
        bodySchema,
        bodyRequired,
        inputSchema: { type: "object", properties, required, additionalProperties: false },
      });
    }
  }
  if (!result.length || Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_OPENAPI_BYTES)
    throw new OpenApiDocumentError("INVALID_DOCUMENT");
  return result.sort((a, b) => a.operationId.localeCompare(b.operationId));
}
/** Validate data only; never evaluate expressions or compile document-controlled code. */
export function matchesOpenApiSchema(
  value: unknown,
  schema: Record<string, unknown>,
  depth = 0,
): boolean {
  if (depth > 16) return false;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (
    schema.type !== undefined &&
    !types.some((type) => {
      if (type === "null") return value === null;
      if (type === "object") return !!value && typeof value === "object" && !Array.isArray(value);
      if (type === "array") return Array.isArray(value);
      if (type === "integer") return typeof value === "number" && Number.isInteger(value);
      if (type === "number") return typeof value === "number" && Number.isFinite(value);
      return typeof value === type;
    })
  )
    return false;
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))
  )
    return false;
  if (Object.hasOwn(schema, "const") && JSON.stringify(schema.const) !== JSON.stringify(value))
    return false;
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum)
      return false;
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum)
      return false;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
    if (
      schema.items &&
      !value.every((item) => matchesOpenApiSchema(item, object(schema.items), depth + 1))
    )
      return false;
  } else if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (typeof schema.minProperties === "number" && Object.keys(row).length < schema.minProperties)
      return false;
    if (typeof schema.maxProperties === "number" && Object.keys(row).length > schema.maxProperties)
      return false;
    const properties = schema.properties ? object(schema.properties) : {};
    if (
      Array.isArray(schema.required) &&
      schema.required.some((key) => typeof key !== "string" || !Object.hasOwn(row, key))
    )
      return false;
    for (const [key, child] of Object.entries(row)) {
      if (Object.hasOwn(properties, key)) {
        if (!matchesOpenApiSchema(child, object(properties[key]), depth + 1)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object" &&
        !matchesOpenApiSchema(child, object(schema.additionalProperties), depth + 1)
      )
        return false;
    }
  }
  return true;
}

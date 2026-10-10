import { expect, test } from "vite-plus/test";
import { apiErrorResponseSchema } from "../src/errors.js";
import { paginationMetaSchema, paginationSchema } from "../src/pagination.js";

test.each(["PAYLOAD_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "REQUEST_TIMEOUT"])(
  "accepts the public body boundary code %s",
  (code) =>
    expect(
      apiErrorResponseSchema.safeParse({ error: { code, message: "Request rejected" } }).success,
    ).toBe(true),
);

test("validates public errors with request correlation and field messages", () => {
  const payload = {
    error: {
      code: "VALIDATION_ERROR",
      message: "Check the submitted fields",
      requestId: "request-123",
      errors: { email: ["Enter a valid email address"] },
    },
  };
  expect(apiErrorResponseSchema.parse(payload)).toEqual(payload);
});

test.each([
  { error: { code: "UNKNOWN", message: "Failure" } },
  { error: { code: "INTERNAL_ERROR", message: "" } },
  { error: { code: "INTERNAL_ERROR", message: "Failure", stack: "private stack" } },
  { error: { code: "NOT_FOUND", message: "Missing", requestId: "invalid request id" } },
  { error: { code: "VALIDATION_ERROR", message: "Invalid", errors: { email: [] } } },
  { error: { code: "NOT_FOUND", message: "Missing" }, debug: "private context" },
])("rejects malformed or private error payload %j", (payload) => {
  expect(apiErrorResponseSchema.safeParse(payload).success).toBe(false);
});

test("uses bounded one-based pagination without coercing untrusted values", () => {
  expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  expect(paginationMetaSchema.parse({ page: 1, pageSize: 20, total: 0 })).toEqual({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  for (const payload of [{ page: 0 }, { page: 1.2 }, { pageSize: 101 }, { page: "1" }]) {
    expect(paginationSchema.safeParse(payload).success).toBe(false);
  }
  expect(paginationMetaSchema.safeParse({ page: 1, pageSize: 20, total: -1 }).success).toBe(false);
});

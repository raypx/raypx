import { createHandler } from "@raypx/api";
import { createFileRoute } from "@tanstack/react-router";

const handle = createHandler({ prefix: "/api/rpc" });

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      HEAD: handle,
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
      OPTIONS: handle,
      ANY: handle,
    },
  },
});

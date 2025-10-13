import { logger } from "@raypx/shared/logger";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

export const Route = createFileRoute("/api/names")({
  server: {
    handlers: {
      GET: () => {
        logger.success("GET /demo/api/names");
        return json(["Alice", "Bob", "Charlie"]);
      },
    },
  },
});

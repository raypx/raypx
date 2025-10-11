import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import consola from "consola";

export const Route = createFileRoute("/api/names")({
  server: {
    handlers: {
      GET: () => {
        consola.success("GET /demo/api/names");
        return json(["Alice", "Bob", "Charlie"]);
      },
    },
  },
});

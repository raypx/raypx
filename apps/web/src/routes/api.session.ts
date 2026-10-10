import { createFileRoute } from "@tanstack/react-router";
import { sessionResponse } from "../server/account.server";

export const Route = createFileRoute("/api/session")({
  server: { handlers: { GET: sessionResponse } },
});

import { createFileRoute } from "@tanstack/react-router";
import { currentUserResponse } from "../server/account.server";

export const Route = createFileRoute("/api/me")({
  server: { handlers: { GET: currentUserResponse } },
});

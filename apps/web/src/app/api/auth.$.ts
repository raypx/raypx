// import { createAuth } from "@raypx/auth/server";

import fs from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

const handler = async ({ request }: { request: Request }) => {
  // const auth = await createAuth();
  // return await auth.handler(request);
  fs.writeFileSync("request.json", JSON.stringify(request, null, 2));
  return json({ message: "OK" });
};

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

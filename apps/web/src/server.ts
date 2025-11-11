import handler from "@tanstack/react-start/server-entry";
import type { Promisable } from "type-fest";

export default {
  fetch(req: Request): Promisable<Response> {
    return handler.fetch(req);
  },
};

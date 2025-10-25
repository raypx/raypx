import { paraglideMiddleware } from "@raypx/i18n/server";
import handler from "@tanstack/react-start/server-entry";

export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, ({ request }) => handler.fetch(request));
  },
};

import { createStart } from "@tanstack/react-start";
import { routeErrorAdapter } from "./lib/route-error";

export const startInstance = createStart(() => ({
  serializationAdapters: [routeErrorAdapter],
}));

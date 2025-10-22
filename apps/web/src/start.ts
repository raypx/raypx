import { createMiddleware, createStart } from "@tanstack/react-start";
import { customErrorAdapter } from "./lib/custom-error";

const globalMiddleware = createMiddleware().server(async ({ next }) => {
  return await next();
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [globalMiddleware],
    serializationAdapters: [customErrorAdapter],
  };
});

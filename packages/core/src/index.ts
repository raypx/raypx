import { createIsomorphicFn } from "@tanstack/react-start";

export const coreFn = createIsomorphicFn()
  .client(() => {
    return "client";
  })
  .server(() => {
    return "server";
  });

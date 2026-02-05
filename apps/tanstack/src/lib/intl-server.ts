import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

export const getAcceptLanguageHeaderServerFn = createServerFn().handler(() => {
  const headers = getRequestHeaders();
  return headers["accept-language"]?.split(",").map((lang: string) => lang.split(";")[0]) ?? [];
});

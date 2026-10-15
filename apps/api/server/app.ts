import { useStorage } from "nitro/storage";
import { getApiRuntime } from "./runtime.js";
export const readWebIndex = async (): Promise<string | null> => {
  const value = await useStorage("assets:web").get<string>("index.html");
  return typeof value === "string" ? value : null;
};
export default {
  async fetch(request: Request): Promise<Response> {
    return (await getApiRuntime(readWebIndex)).app.fetch(request);
  },
};

import { getApiRuntime } from "./runtime.js";

export default {
  async fetch(request: Request): Promise<Response> {
    return (await getApiRuntime()).app.fetch(request);
  },
};

import { getApiRuntime } from "../runtime/node.js";

export default {
  async fetch(request: Request): Promise<Response> {
    return (await getApiRuntime()).app.fetch(request);
  },
};

// The probe copies this fixture beside the built Worker so this import resolves there.
import worker from "./index.mjs";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    const marked = new Response(response.body, response);
    marked.headers.set(env.WORKER_PROBE_HEADER, "1");
    return marked;
  },
};

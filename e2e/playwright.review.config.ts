import configuration from "./playwright.config.js";

// Explicitly review already-running, owned compiled artifacts without rebuilding them.
const { webServer: _webServer, ...review } = configuration;
export default review;

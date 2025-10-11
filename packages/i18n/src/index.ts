// Shared exports (safe for both client and server)

export * from "./config";
export * from "./server";
export * from "./types";

// Note: Do NOT import from "./client" here as it contains browser-specific code
// Use "@raypx/i18n/client" for client-side initialization

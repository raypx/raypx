process.env.NITRO_PORT ??= process.env.PORT ?? "3002";
await import("../.output/server/index.mjs");

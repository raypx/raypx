import { definePlugin } from "nitro";
import { validateWebEnvironment } from "../public-address.js";

export default definePlugin(() => {
  try {
    validateWebEnvironment(process.env);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Invalid Web public address configuration",
    );
    process.exit(1);
  }
});

import type { PlopTypes } from "@turbo/gen";

import { createPackageGenerator } from "./templates/package/generator";

// List of generators to be registered
const generators = [
  // Add generators here
  createPackageGenerator,
];

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  // Set default configuration
  plop.setWelcomeMessage("🚀 Welcome to Raypx Generator!");

  for (const gen of generators) {
    gen(plop);
  }
}

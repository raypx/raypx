import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { createReactConfig } from "../../vitest.base";

export default defineConfig(
  createReactConfig({
    plugins: [
      react({
        babel: {
          plugins: [
            [
              "babel-plugin-react-compiler",
              {
                target: "19",
              },
            ],
          ],
        },
      }),
    ],
  }),
);

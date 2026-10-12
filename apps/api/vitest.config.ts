import { workspaceTests } from "../../test.config.js";

export default workspaceTests({
  include: ["server/**/*.{test,spec}.{ts,tsx}"],
  env: {
    AUTH_URL: "http://localhost:3002",
    DATABASE_URL: "postgres://voidmix:test@example.invalid:5432/voidmix",
  },
});

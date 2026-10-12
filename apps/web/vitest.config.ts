import { workspaceTests } from "../../test.config.js";

export default workspaceTests({
  include: ["{src,server,i18n,tests}/**/*.{test,spec}.{ts,tsx}"],
  env: {
    AUTH_URL: "http://localhost:3000",
    DATABASE_URL: "postgres://voidmix:test@example.invalid:5432/voidmix",
  },
});

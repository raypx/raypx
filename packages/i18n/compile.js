import { compile } from "@inlang/paraglide-js";
import { project, outDir, urlPatterns } from "./index.js";

async function compileParaglide() {
  const result = await compile({
    project,
    outdir: outDir,
    outputStructure: "message-modules",
    cookieName: "lang",
    strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
    urlPatterns,
  });
  return result;
}

export default compileParaglide;
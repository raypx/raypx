import { compile } from "@inlang/paraglide-js";
import { urlPatterns } from ".";

export async function compileParaglide() {
  console.log("__dirname", __dirname);
  const result = await compile({
    project: "./.inlang",
    outdir: "./.output/paraglide",
    outputStructure: "message-modules",
    cookieName: "lang",
    strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
    urlPatterns,
  });
  return result;
}

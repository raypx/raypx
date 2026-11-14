import { createHash } from "node:crypto";
import { themeTokens } from "@raypx/ui/themes/config";

// Standalone documents cannot inherit the application theme. Keep these neutral
// values sourced from UI's semantic theme tokens and DESIGN.md's document scale.
export const documentStyles = `:root {
  color-scheme: light dark;
  --background: ${themeTokens.light.background};
  --foreground: ${themeTokens.light.foreground};
  --muted: ${themeTokens.light.muted};
  --muted-foreground: ${themeTokens.light["muted-foreground"]};
  --border: ${themeTokens.light.border};
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: ${themeTokens.dark.background};
    --foreground: ${themeTokens.dark.foreground};
    --muted: ${themeTokens.dark.muted};
    --muted-foreground: ${themeTokens.dark["muted-foreground"]};
    --border: ${themeTokens.dark.border};
  }
}
* { box-sizing: border-box; }
html { background: var(--background); color: var(--foreground); }
body {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1.5rem;
  font: 0.875rem/1.75 Inter, "SF Pro Display", "Segoe UI", "Noto Sans SC", system-ui, sans-serif;
  overflow-wrap: anywhere;
}
body > :first-child { margin-top: 0; }
body > :last-child { margin-bottom: 0; }
h1, h2, h3, h4, h5, h6 { margin: 1.5rem 0 1rem; font-weight: 600; line-height: 1.3; }
h1 { font-size: 1.5rem; }
h2 { font-size: 1.125rem; }
h3, h4, h5, h6 { font-size: 1rem; }
p, ul, ol, blockquote, pre, table { margin: 1rem 0; }
ul, ol { padding-inline-start: 1.5rem; }
li + li { margin-top: 0.25rem; }
li > ul, li > ol { margin: 0.25rem 0; }
a { color: inherit; text-decoration: underline; text-underline-offset: 0.2em; }
a:hover { text-decoration-thickness: 2px; }
a:focus-visible { outline: 2px solid var(--foreground); outline-offset: 3px; border-radius: 2px; }
blockquote { margin-inline: 0; border-inline-start: 3px solid var(--border); padding-inline-start: 1rem; color: var(--muted-foreground); }
blockquote > :first-child { margin-top: 0; }
blockquote > :last-child { margin-bottom: 0; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.875em; }
code { border-radius: 0.25rem; background: var(--muted); padding: 0.125rem 0.25rem; }
pre { max-width: 100%; overflow-x: auto; border: 1px solid var(--border); border-radius: 0.5rem; background: var(--muted); padding: 1rem; line-height: 1.6; }
pre code { border-radius: 0; background: transparent; padding: 0; font-size: inherit; overflow-wrap: normal; }
table { display: block; width: max-content; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { border: 1px solid var(--border); padding: 0.5rem 0.75rem; text-align: start; vertical-align: top; }
th { background: var(--muted); font-weight: 600; }
hr { margin: 1.5rem 0; border: 0; border-top: 1px solid var(--border); }
img { display: block; max-width: 100%; height: auto; margin: 1rem 0; }
::selection { background: var(--foreground); color: var(--background); }
@media (max-width: 30rem) { body { padding: 1rem; } }`;

export const documentStyleSource = `'sha256-${createHash("sha256").update(documentStyles).digest("base64")}'`;

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PageVersion } from "@raypx/core/pages";
import { documentStyles, documentStyleSource } from "./document-style.js";

const elements = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];
function escape(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** CommonMark/GFM parser, raw HTML disabled, allowlisted elements and safe URL protocols. */
export function renderPage(page: PageVersion): string {
  if (page.kind === "html") return page.body;
  const content = renderToStaticMarkup(
    createElement(
      Markdown,
      {
        skipHtml: true,
        allowedElements: elements,
        remarkPlugins: [remarkGfm],
        urlTransform: (url, key) => {
          // The document CSP allows self-contained raster images only. Keep data
          // URLs out of links and exclude active image formats such as SVG.
          if (key === "src")
            return /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)
              ? url
              : undefined;
          return defaultUrlTransform(url);
        },
      },
      page.body,
    ),
  );
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(page.title)}</title><style>${documentStyles}</style></head><body>${content}</body></html>`;
}
export function pageResponseHeaders(
  allowedOrigins: readonly string[],
  kind: PageVersion["kind"] = "html",
): Headers {
  const origins = [
    ...new Set(
      allowedOrigins.flatMap((value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" || url.protocol === "http:" ? [url.origin] : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
  const contentPolicy =
    kind === "html"
      ? "sandbox allow-scripts; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
      : `sandbox; script-src 'none'; style-src ${documentStyleSource}`;
  return new Headers({
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'none'; ${contentPolicy}; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${origins.length ? origins.join(" ") : "'none'"}`,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  });
}

import { createTokenizer } from "@orama/tokenizers/mandarin";
import { createFileRoute } from "@tanstack/react-router";
import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

const server = createFromSource(source, {
  localeMap: {
    en: "english",
    zh: {
      tokenizer: createTokenizer(),
    },
  },
});

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => server.GET(request),
    },
  },
});

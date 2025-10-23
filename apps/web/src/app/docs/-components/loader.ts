import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { source } from "@/lib/source";

export type LoaderData = {
  tree: object;
  path: string;
  lang: string;
  slugs: string[];
};

export const serverLoader = createServerFn({ method: "GET" })
  .inputValidator((params: { slugs: string[]; lang: string }) => params)
  .handler(({ data: { slugs, lang } }) => {
    const page = source.getPage(slugs, lang);
    if (!page) throw notFound();

    const tree = source.getPageTree(lang);
    return {
      tree: tree,
      path: page.path,
      lang,
      slugs,
    } as LoaderData;
  });

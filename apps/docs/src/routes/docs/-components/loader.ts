import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { source } from "@/lib/source";

export type LoaderData = {
  tree: object;
  path: string;
  slugs: string[];
};

export const serverLoader = createServerFn({ method: "GET" })
  .inputValidator((params: { slugs: string[] }) => params)
  .handler(({ data: { slugs } }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();

    const tree = source.getPageTree();
    return {
      tree: tree,
      path: page.path,
      slugs,
    } as LoaderData;
  });

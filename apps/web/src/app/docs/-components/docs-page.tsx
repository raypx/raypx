import { Icon } from "@raypx/ui/components/icon";
import type { AnyRoute } from "@tanstack/react-router";
import type * as PageTree from "fumadocs-core/page-tree";
import { createClientLoader } from "fumadocs-mdx/runtime/vite";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page";
import { useMemo } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { docs } from "../../../../.source";
import type { LoaderData } from "./loader";

export const clientLoader = createClientLoader(docs.doc, {
  id: "docs",
  component({ toc, frontmatter, default: MDX }) {
    return (
      <DocsPage
        footer={{
          enabled: false,
        }}
        full
        tableOfContent={{
          enabled: true,
          style: "clerk",
        }}
        toc={toc}
      >
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX components={defaultMdxComponents} />
        </DocsBody>
      </DocsPage>
    );
  },
});

export function DocsPageComponent<R extends AnyRoute>({ Route }: { Route: R }) {
  const data: LoaderData = Route.useLoaderData();
  const lang = data.lang;
  const Content = clientLoader.getComponent(data.path);
  const tree = useMemo(() => transformPageTree(data.tree as PageTree.Folder), [data.tree]);

  return (
    <DocsLayout {...baseOptions(lang)} tree={tree}>
      <Content />
    </DocsLayout>
  );
}

function transformPageTree(tree: PageTree.Folder): PageTree.Folder {
  function transform<T extends PageTree.Item | PageTree.Separator>(item: T) {
    if (typeof item.icon !== "string") return item;

    return {
      ...item,
      icon: <Icon name={item.icon} />,
    };
  }

  return {
    ...tree,
    icon: typeof tree.icon === "string" ? <Icon name={tree.icon} /> : tree.icon,
    index: tree.index ? transform(tree.index) : undefined,
    children: tree.children.map((item) => {
      if (item.type === "folder") return transformPageTree(item);
      return transform(item);
    }),
  };
}

import browserCollections from "fumadocs-mdx:collections/browser";
import { DocsLayout } from "@fumadocs/base-ui/layouts/notebook";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "@fumadocs/base-ui/page";
import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type * as PageTree from "fumadocs-core/page-tree";
import { useMemo } from "react";
import { getMdxComponents } from "~/components/layout/mdx-components";
import { baseOptions } from "~/lib/layout.shared";
import { source } from "~/lib/source";

const loader = createServerFn({ method: "GET" })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();
    const { title, description } = page.data;
    return {
      path: page.path,
      slugs,
      title,
      description,
      tree: source.pageTree as object,
    };
  });

function transformPageTree(tree: PageTree.Folder): PageTree.Folder {
  function transform<T extends PageTree.Item | PageTree.Separator>(item: T) {
    if (typeof item.icon !== "string") return item;
    return {
      ...item,
      icon: (
        <span
          dangerouslySetInnerHTML={{
            __html: item.icon,
          }}
        />
      ),
    };
  }
  return {
    ...tree,
    index: tree.index ? transform(tree.index) : undefined,
    children: tree.children.map((item) => {
      if (item.type === "folder") return transformPageTree(item);
      return transform(item);
    }),
  };
}

export function DocsPageComponent() {
  const data = useLoaderData({ from: "/docs/$" });
  const Content = useMemo(() => clientLoader.getComponent(data.path), [data.path]);
  const options = baseOptions();
  const tree = useMemo(() => transformPageTree(data.tree as PageTree.Folder), [data.tree]);

  return (
    <DocsLayout
      {...options}
      nav={{ ...options.nav, mode: "top" }}
      sidebar={{
        collapsible: false,
        tabs: [
          {
            title: "Docs",
            url: "/docs",
          },
        ],
      }}
      tabMode="navbar"
      tree={tree}
    >
      <Content path={data.path} />
    </DocsLayout>
  );
}

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, frontmatter, lastModified, default: MDX }, { path }: { path: string }) {
    return (
      <DocsPage
        editOnGithub={{
          owner: "raypx",
          repo: "raypx",
          sha: "main",
          path: `apps/docs/content/docs/${path}`,
        }}
        lastUpdate={lastModified as Date}
        tableOfContent={{ enabled: true, style: "clerk" }}
        toc={toc}
      >
        <DocsTitle>{(frontmatter as { title?: string }).title}</DocsTitle>
        <DocsDescription>{(frontmatter as { description?: string }).description}</DocsDescription>
        <DocsBody>
          <MDX components={getMdxComponents()} />
        </DocsBody>
      </DocsPage>
    );
  },
});

export const Route = createFileRoute("/docs/$")({
  component: DocsPageComponent,
  loader: async ({ params }) => {
    if (!params._splat) {
      throw redirect({
        to: "/docs/$",
        params: { _splat: "start" },
      });
    }
    const data = await loader({ data: params._splat?.split("/").filter(Boolean) ?? [] });
    await clientLoader.preload(data.path);
    return data;
  },
  head: async (props) => {
    const { title, description } = props.loaderData ?? {};
    return {
      meta: [
        {
          title: `${title} - Raypx`,
          description: description,
        },
      ],
    };
  },
});

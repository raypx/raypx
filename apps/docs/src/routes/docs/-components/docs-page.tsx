import { Icon } from "@raypx/ui/components/icon";
import type { AnyRoute } from "@tanstack/react-router";
import type * as PageTree from "fumadocs-core/page-tree";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { useMemo } from "react";
import { baseOptions } from "@/lib/layout.shared";
import type { ClientLoaderType } from "./client.loader";
import type { LoaderData } from "./loader";

export function DocsPageComponent<R extends AnyRoute>({
  Route,
  loader,
}: {
  Route: R;
  loader: ClientLoaderType;
}) {
  const data: LoaderData = Route.useLoaderData();
  const Content = loader.getComponent(data.path);
  const tree = useMemo(() => transformPageTree(data.tree as PageTree.Folder), [data.tree]);

  return (
    <DocsLayout {...baseOptions()} tree={tree}>
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

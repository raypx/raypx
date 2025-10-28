import { createClientLoader as createFumadocsClientLoader } from "fumadocs-mdx/runtime/vite";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page";
import { docs } from "../../../../.source";

export const createClientLoader = () =>
  createFumadocsClientLoader(docs.doc, {
    id: "docs",
    component({ toc, frontmatter, default: MDX }) {
      return (
        <DocsPage
          footer={{
            enabled: false,
          }}
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

export type ClientLoaderType = ReturnType<typeof createClientLoader>;

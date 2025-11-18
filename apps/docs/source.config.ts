import { remarkMdxFiles } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import lastModified from "fumadocs-mdx/plugins/last-modified";

export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig({
  plugins: [lastModified({ versionControl: "git" })],
  mdxOptions: {
    remarkPlugins: [remarkMdxFiles],
    rehypeCodeOptions: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  },
});

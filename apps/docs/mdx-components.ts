import { ImageZoom } from "@fumadocs/base-ui/components/image-zoom";
import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    ImageZoom,
  };
}

import { Banner } from "fumadocs-ui/components/banner";
import * as Files from "fumadocs-ui/components/files";
import * as TabsComponents from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";

export const getMdxComponents = () => {
  return {
    ...defaultMdxComponents,
    Banner,
    ...Files,
    ...TabsComponents,
  } as const;
};

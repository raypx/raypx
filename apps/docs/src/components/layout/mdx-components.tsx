import { Banner } from "@fumadocs/base-ui/components/banner";
import * as Files from "@fumadocs/base-ui/components/files";
import * as TabsComponents from "@fumadocs/base-ui/components/tabs";
import defaultMdxComponents from "@fumadocs/base-ui/mdx";

export const getMdxComponents = () => {
  return {
    ...defaultMdxComponents,
    Banner,
    ...Files,
    ...TabsComponents,
  } as const;
};

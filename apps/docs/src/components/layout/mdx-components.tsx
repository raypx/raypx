import { Banner } from "fumadocs-ui/components/banner";
import * as Files from "fumadocs-ui/components/files";
import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import defaultMdxComponents from "fumadocs-ui/mdx";

export const getMdxComponents = () => {
  return {
    ...defaultMdxComponents,
    Banner,
    ...Files,
    img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <ImageZoom {...props} />,
  } as const;
};

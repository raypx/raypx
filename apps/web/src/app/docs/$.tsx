import { createFileRoute } from "@tanstack/react-router";
import { getLocale } from "@/lib/i18n/runtime";
import { clientLoader, DocsPageComponent } from "./-components/docs-page";
import { serverLoader } from "./-components/loader";

export const Route = createFileRoute("/docs/$")({
  component: () => <DocsPageComponent Route={Route} />,
  loader: async ({ params }) => {
    const lang = getLocale();
    const data = await serverLoader({
      data: {
        slugs: params._splat?.split("/") ?? [],
        lang,
      },
    });
    await clientLoader.preload(data.path);
    return data;
  },
});

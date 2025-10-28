import { getLocale } from "@raypx/i18n/runtime";
import { createFileRoute } from "@tanstack/react-router";
import { createClientLoader } from "./-components/client.loader";
import { DocsPageComponent } from "./-components/docs-page";
import { serverLoader } from "./-components/loader";

const clientLoader = createClientLoader();

export const Route = createFileRoute("/docs/")({
  component: () => <DocsPageComponent loader={clientLoader} Route={Route} />,
  loader: async () => {
    const lang = getLocale();
    const data = await serverLoader({
      data: {
        slugs: [],
        lang,
      },
    });
    await clientLoader.preload(data.path);
    return data;
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { createClientLoader } from "./-components/client.loader";
import { DocsPageComponent } from "./-components/docs-page";
import { serverLoader } from "./-components/loader";

const clientLoader = createClientLoader();

export const Route = createFileRoute("/docs/$")({
  component: () => <DocsPageComponent loader={clientLoader} Route={Route} />,
  loader: async ({ params }) => {
    const lang = params.locale;
    const data = await serverLoader({
      data: {
        slugs: params._splat?.split("/") ?? [],
        lang: lang ?? "en",
      },
    });
    await clientLoader.preload(data.path);
    return data;
  },
});

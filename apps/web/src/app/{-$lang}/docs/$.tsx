import { createFileRoute } from "@tanstack/react-router";
import { clientLoader, DocsPageComponent } from "./-components/docs-page";
import { serverLoader } from "./-components/loader";

export const Route = createFileRoute("/{-$lang}/docs/$")({
  component: () => <DocsPageComponent Route={Route} />,
  loader: async ({ params }) => {
    console.log(params);
    const data = await serverLoader({
      data: {
        slugs: params._splat?.split("/") ?? [],
        lang: params.lang,
      },
    });
    await clientLoader.preload(data.path);
    return data;
  },
});

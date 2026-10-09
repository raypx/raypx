import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import stylesheet from "@raypx/ui/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Raypx" },
      { name: "description", content: "Raypx Personal AI Workbench" },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: RootDocument,
  notFoundComponent: () => (
    <main>
      <h1>Page Not Found</h1>
      <a href="/">Back to Home</a>
    </main>
  ),
});

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

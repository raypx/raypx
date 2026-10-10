import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { QueryClient } from "@raypx/client/react";
import { Button } from "@raypx/ui/components/button";
import { ErrorState } from "@raypx/ui/components/error-state";
import { ThemeProvider, themeInitialization } from "../components/theme";
import stylesheet from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Raypx" },
      { name: "description", content: "A type-safe full-stack foundation" },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: RootDocument,
  errorComponent: ({ reset }) => (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <ErrorState
        title="Unable to open this page"
        description="Try again, or return to the home page."
        action={
          <>
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" asChild>
              <a href="/">Back to Home</a>
            </Button>
          </>
        }
      />
    </main>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-20">
      <h1 className="text-3xl font-semibold">Page Not Found</h1>
      <Button variant="outline" asChild>
        <a href="/">Back to Home</a>
      </Button>
    </main>
  ),
});

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitialization }} />
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <Outlet />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

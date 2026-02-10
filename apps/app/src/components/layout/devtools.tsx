import React from "react";

// Lazy load devtools only in development
const TanStackDevtools = React.lazy(() =>
  import("@tanstack/react-devtools").then((res) => ({
    default: res.TanStackDevtools,
  })),
);

const ReactQueryDevtoolsPanel = React.lazy(() =>
  import("@tanstack/react-query-devtools").then((res) => ({
    default: res.ReactQueryDevtoolsPanel,
  })),
);

const TanStackRouterDevtoolsPanel = React.lazy(() =>
  import("@tanstack/react-router-devtools").then((res) => ({
    default: res.TanStackRouterDevtoolsPanel,
  })),
);

export function Devtools() {
  // Skip devtools in production
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <React.Suspense fallback={null}>
      <TanStackDevtools
        plugins={[
          {
            name: "TanStack Router",
            render: <TanStackRouterDevtoolsPanel />,
          },
          {
            name: "TanStack Query",
            render: <ReactQueryDevtoolsPanel />,
          },
        ]}
      />
    </React.Suspense>
  );
}

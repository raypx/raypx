import { createFileRoute, Outlet } from "@tanstack/react-router";

function AuthLayout() {
  return (
    <div>
      <h1>Auth layout</h1>
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

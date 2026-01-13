import { ThemeSwitcher } from "@raypx/ui/components/theme-switcher";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <div className="grid gap-6">
        <h1 className="bg-linear-to-r from-rose-400 via-fuchsia-500 to-indigo-500 bg-clip-text font-bold text-6xl text-transparent">
          hello world
        </h1>
        <Link to="/login">Login</Link>
        <ThemeSwitcher />
      </div>
    </div>
  );
}

import { SecurityPanel, useAuth } from "@raypx/auth";
import { createFileRoute } from "@tanstack/react-router";
import { Header } from "~/layouts/dashboard/header";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

function DashboardPage() {
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session } = useSession();

  return (
    <>
      <Header />

      <main id="main-content" className="flex min-h-min flex-1 flex-col p-4">
        <div className="space-y-6">
          {/* Welcome Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Welcome back,{" "}
                <span className="bg-linear-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                  {session?.user?.name?.split(" ")[0] || "User"}
                </span>
                !
              </h1>
              <p className="text-muted-foreground mt-1">
                Your dashboard is ready for redesign
              </p>
            </div>
          </div>

          {/* Security shortcuts (from @raypx/auth) */}
          <SecurityPanel
            changePasswordSearch={{ tab: "security" }}
            changePasswordTo="/_app/dashboard/"
            forgotPasswordTo="/_auth/forgot-password"
            providers={["github", "google"]}
          />
        </div>
      </main>
    </>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@raypx/auth";
import { cn } from "@raypx/shared/utils";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@raypx/ui/components";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthGuard } from "~/layouts/auth/auth-guard";
import { AuthCard } from "~/layouts/auth/card";

function MagicLinkPage() {
  const { auth, redirectTo } = useAuth();
  const isHydrated = useIsHydrated();

  const formSchema = z.object({
    email: z.email({
      message: "Email is invalid",
    }),
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function sendMagicLink({ email }: z.infer<typeof formSchema>) {
    try {
      const searchParam = new URLSearchParams(window.location.search).get("redirectTo");
      const redirectTo = searchParam || "/";

      await auth.signIn.magicLink({
        email,
        callbackURL: redirectTo,
        fetchOptions: { throw: true },
      });

      // toast: Magic link sent! Check your email
      form.reset();
    } catch (_error) {
      // toast: Failed to send magic link
    }
  }

  return (
    <AuthGuard redirectTo={redirectTo || "/dashboard"}>
      <AuthCard
        description="Sign in with a magic link sent to your email"
        footer={
          <>
            Don't have an account?{" "}
            <Link
              className="font-medium underline underline-offset-4 hover:text-primary"
              to="/sign-up"
            >
              Sign Up
            </Link>
          </>
        }
        title="Magic Link"
      >
        <Form {...form}>
          <form
            className={cn("grid w-full gap-6")}
            noValidate={isHydrated}
            onSubmit={form.handleSubmit(sendMagicLink)}
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>

                  <FormControl>
                    <Input
                      autoComplete="email"
                      disabled={isSubmitting}
                      placeholder="Email"
                      type="email"
                      {...field}
                    />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />

            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? <Loader2 className="animate-spin" /> : "Send Magic Link"}
            </Button>
          </form>
        </Form>
      </AuthCard>
    </AuthGuard>
  );
}

export const Route = createFileRoute("/_auth/magic-link")({
  head: () => ({
    meta: [{ title: "Magic Link", description: "Sign in with a magic link sent to your email" }],
  }),
  component: MagicLinkPage,
});

import type { BetterFetchOption } from "@better-fetch/fetch";
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
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuthPageConfig } from "./-hooks/use-auth-page-config";

function MagicLinkPage() {
  useAuthPageConfig({
    footerType: "sign-in",
  });

  const { auth } = useAuth();
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
      const fetchOptions: BetterFetchOption = {
        throw: true,
      };

      const searchParam = new URLSearchParams(window.location.search).get("redirectTo");
      const redirectTo = searchParam || "/";

      await auth.signIn.magicLink({
        email,
        callbackURL: redirectTo,
        fetchOptions,
      });

      // toast: Magic link sent! Check your email
      form.reset();
    } catch (_error) {
      // toast: Failed to send magic link
    }
  }

  return (
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
  );
}

export const Route = createFileRoute("/_auth/magic-link")({
  head: () => ({
    meta: [{ title: "Magic Link", description: "Sign in with a magic link sent to your email" }],
  }),
  component: MagicLinkPage,
});

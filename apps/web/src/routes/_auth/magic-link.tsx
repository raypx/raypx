import { useAuth } from "@raypx/auth";
import { Button, Field, FieldError, FieldLabel, Input } from "@raypx/ui/components";
import { toast } from "@raypx/ui/components/toast";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { cn } from "@raypx/ui/lib/utils";
import { IconLoader } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AuthCard } from "~/layouts/auth/card";

function MagicLinkPage() {
  const { auth } = useAuth();
  const isHydrated = useIsHydrated();

  const formSchema = z.object({
    email: z.string().email({
      message: "Email is invalid",
    }),
  });

  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      try {
        // Validate with Zod schema
        const validated = formSchema.parse(value);

        const searchParam = new URLSearchParams(window.location.search).get("redirectTo");
        const redirectTo = searchParam || "/";

        await auth.signIn.magicLink({
          email: validated.email,
          callbackURL: redirectTo,
          fetchOptions: { throw: true },
        });

        toast.success("Magic link sent! Check your email");
        form.reset();
      } catch (error: any) {
        // Handle validation errors
        if (error?.issues) {
          // Zod validation errors are handled by field validators
          return;
        }
        // Handle API errors
        const errorMessage = error?.message || "Failed to send magic link. Please try again.";
        toast.error(errorMessage);
        console.error("Magic link error:", error);
      }
    },
  });

  return (
    <AuthCard
      description="Sign in with a magic link sent to your email"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            className="font-medium underline underline-offset-4 hover:text-primary"
            to="/signup"
          >
            Sign Up
          </Link>
        </>
      }
      title="Magic Link"
    >
      <form
        className={cn("grid w-full gap-6")}
        noValidate={isHydrated}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  autoComplete="email"
                  disabled={form.state.isSubmitting}
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Email"
                  type="email"
                  value={field.state.value}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
          name="email"
          validators={{
            onChange: formSchema.shape.email,
          }}
        />

        <Button className="w-full" disabled={form.state.isSubmitting} type="submit">
          {form.state.isSubmitting ? <IconLoader className="animate-spin" /> : "Send Magic Link"}
        </Button>
      </form>
    </AuthCard>
  );
}

export const Route = createFileRoute("/_auth/magic-link")({
  head: () => ({
    meta: [{ title: "Magic Link", description: "Sign in with a magic link sent to your email" }],
  }),
  component: MagicLinkPage,
});

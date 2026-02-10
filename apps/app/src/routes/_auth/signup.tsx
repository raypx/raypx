import { createSignUpFormSchema, useAuth, useOnSuccessTransition } from "@raypx/auth";
import { Button, Field, FieldError, FieldLabel, Input, PasswordField } from "@raypx/ui/components";
import { toast } from "@raypx/ui/components/toast";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { cn } from "@raypx/ui/lib/utils";
import { IconLoader } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthCard } from "~/layouts/auth/card";
import { OrDivider } from "~/layouts/auth/or-divider";
import { SocialProviders } from "~/layouts/auth/social-providers";

function SignUpPage() {
  const { credentials, auth, redirectTo } = useAuth();
  const navigate = useNavigate();
  const isHydrated = useIsHydrated();
  const { onSuccess } = useOnSuccessTransition({ redirectTo: redirectTo });

  const usernameEnabled = credentials?.username;

  const formSchema = createSignUpFormSchema({
    usernameEnabled,
    passwordValidation: { minLength: 8, maxLength: 100 },
  });

  const form = useForm({
    defaultValues: {
      email: "",
      username: usernameEnabled ? "" : undefined,
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      try {
        // Validate with Zod schema
        const validated = formSchema.parse(value);

        // Use username signup if username is enabled and provided
        let name = "";
        if (usernameEnabled && "username" in validated) {
          const usernameValue = (validated as any).username;
          if (typeof usernameValue === "string") {
            name = usernameValue;
          }
        }

        const response = await auth.signUp.email({
          email: validated.email,
          password: validated.password,
          name,
          fetchOptions: { throw: true },
        });

        if ("token" in response && response.token) {
          // Registration successful and auto-signed in
          toast.success("Account created successfully!");
          await onSuccess();
        } else {
          // Email verification required
          toast.success("Please check your email to verify your account");
          await navigate({ to: "/signin" });
        }
      } catch (error: any) {
        // Handle validation errors
        if (error?.issues) {
          // Zod validation errors are handled by field validators
          return;
        }
        // Handle specific error messages
        const errorMessage = error?.message || "Sign up failed. Please try again.";
        toast.error(errorMessage);
        console.error("Sign up error:", error);
      }
    },
  });

  return (
    <AuthCard
      description="Create an account"
      footer={
        <>
          Already have an account?{" "}
          <Link
            className="font-medium underline underline-offset-4 hover:text-primary"
            to="/signin"
          >
            Sign In
          </Link>
        </>
      }
      title="Sign Up"
    >
      <SocialProviders disabled={form.state.isSubmitting} redirectTo={redirectTo} />

      <OrDivider />

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

        {usernameEnabled && (
          <form.Field
            children={(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Username</FieldLabel>
                  <Input
                    autoComplete="username"
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Username"
                    type="text"
                    value={field.state.value || ""}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
            name="username"
            validators={{
              onChange:
                usernameEnabled && "username" in formSchema.shape
                  ? (formSchema.shape as any).username
                  : undefined,
            }}
          />
        )}

        <form.Field
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <PasswordField
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Password"
                  value={field.state.value}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
          name="password"
          validators={{
            onChange: formSchema.shape.password,
          }}
        />

        <form.Field
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Confirm Password</FieldLabel>
                <PasswordField
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  placeholder="Confirm Password"
                  value={field.state.value}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
          name="confirmPassword"
          validators={{
            onChange: ({ value, fieldApi }) => {
              const password = fieldApi.form.getFieldValue("password");
              if (!value) {
                return "Please confirm your password";
              }
              if (value !== password) {
                return "Passwords do not match";
              }
              return undefined;
            },
          }}
        />

        <Button className="w-full" disabled={form.state.isSubmitting} type="submit">
          {form.state.isSubmitting ? <IconLoader className="animate-spin" /> : "Sign Up"}
        </Button>
      </form>
    </AuthCard>
  );
}

export const Route = createFileRoute("/_auth/signup")({
  head: () => ({
    meta: [{ title: "Sign Up - Raypx", description: "Create an account" }],
  }),
  component: SignUpPage,
});

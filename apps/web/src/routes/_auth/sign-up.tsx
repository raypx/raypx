import {
  createAuthRouteBeforeLoad,
  createSignUpFormSchema,
  getSignUpFormDefaults,
  useAuth,
  useOnSuccessTransition,
} from "@raypx/auth";
import { cn } from "@raypx/shared/utils";
import {
  Button,
  Checkbox,
  Input,
  PasswordField,
} from "@raypx/ui/components";
import { toast } from "@raypx/ui/components/toast";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { AuthCard } from "~/layouts/auth/card";
import { OrDivider } from "~/layouts/auth/or-divider";
import { SocialProviders } from "~/layouts/auth/social-providers";

function SignUpPage() {
  const { credentials, auth, redirectTo } = useAuth();
  const navigate = useNavigate();
  const isHydrated = useIsHydrated();
  const { onSuccess } = useOnSuccessTransition({ redirectTo });

  const rememberMeEnabled = credentials?.rememberMe;
  const usernameEnabled = credentials?.username;

  const formSchema = createSignUpFormSchema({
    usernameEnabled,
    passwordValidation: { minLength: 8, maxLength: 100 },
    rememberMeEnabled,
  });

  type FormValues = z.infer<typeof formSchema>;

  // Helper function to validate field using zod schema
  const validateField = (fieldName: keyof FormValues, value: unknown): string | undefined => {
    try {
      const fieldSchema = formSchema.shape[fieldName];
      if (fieldSchema) {
        fieldSchema.parse(value);
      }
      return undefined;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return error.issues[0]?.message;
      }
      return "Invalid value";
    }
  };

  const form = useForm({
    defaultValues: getSignUpFormDefaults(rememberMeEnabled),
    onSubmit: async ({ value }) => {
      try {
        const response = await auth.signUp.email({
          email: value.email,
          password: value.password,
          name: value.name || "",
          fetchOptions: { throw: true },
        });

        if ("token" in response && response.token) {
          // Successfully signed up and logged in
          toast.success("Account created successfully!");
          await onSuccess();
        } else {
          // Email verification required
          toast.info("Please check your email to verify your account");
          await navigate({
            to: "/sign-in",
            search: { email: value.email },
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to create account. Please try again.";
        toast.error(errorMessage);
        form.setFieldMeta("password", (prev) => ({
          ...prev,
          errorMap: {
            onSubmit: errorMessage,
          },
        }));
        form.setFieldValue("password", "");
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
            to="/sign-in"
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
        {!usernameEnabled && (
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => validateField("name", value),
            }}
          >
            {(field) => (
              <div className="space-y-2">
                <label
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  htmlFor={field.name}
                >
                  Name
                </label>
                <Input
                  autoComplete="name"
                  disabled={form.state.isSubmitting}
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Your name"
                  value={field.state.value || ""}
                />
                {field.state.meta.errors && (
                  <p className="text-sm font-medium text-destructive">
                    {field.state.meta.errors[0]}
                  </p>
                )}
              </div>
            )}
          </form.Field>
        )}

        <form.Field
          name="email"
          validators={{
            onChange: ({ value }) => validateField("email", value),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <label
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                htmlFor={field.name}
              >
                {usernameEnabled ? "Username" : "Email"}
              </label>
              <Input
                autoComplete={usernameEnabled ? "username" : "email"}
                disabled={form.state.isSubmitting}
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={usernameEnabled ? "Username" : "Email"}
                type={usernameEnabled ? "text" : "email"}
                value={field.state.value}
              />
              {field.state.meta.errors && (
                <p className="text-sm font-medium text-destructive">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="password"
          validators={{
            onChange: ({ value }) => validateField("password", value),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <label
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                htmlFor={field.name}
              >
                Password
              </label>
              <PasswordField
                autoComplete="new-password"
                disabled={form.state.isSubmitting}
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Password"
                value={field.state.value}
              />
              {field.state.meta.errors && (
                <p className="text-sm font-medium text-destructive">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {rememberMeEnabled && (
          <form.Field name="rememberMe">
            {(field) => (
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={field.state.value || false}
                  disabled={form.state.isSubmitting}
                  id={field.name}
                  onCheckedChange={(checked) => field.handleChange(!!checked)}
                />
                <label
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  htmlFor={field.name}
                >
                  Remember Me
                </label>
              </div>
            )}
          </form.Field>
        )}

        <Button className="w-full" disabled={form.state.isSubmitting} type="submit">
          {form.state.isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Creating account...
            </>
          ) : (
            "Sign Up"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}

export const Route = createFileRoute("/_auth/sign-up")({
  head: () => ({
    meta: [{ title: "Sign Up - Raypx", description: "Create an account" }],
  }),
  beforeLoad: createAuthRouteBeforeLoad("/dashboard"),
  component: SignUpPage,
});

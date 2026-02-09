import { useAuth } from "@raypx/auth";
import { Button, Field, FieldError, FieldLabel } from "@raypx/ui/components";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@raypx/ui/components/input-otp";
import { toast } from "@raypx/ui/components/toast";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { cn } from "@raypx/ui/lib/utils";
import { IconLoader } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

const twoFactorSchema = z.object({
  code: z.string().length(6, { message: "Code must be 6 digits" }),
});

type TwoFactorVerifyProps = {
  onSuccess?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
  title?: string;
  description?: string;
  className?: string;
};

export function TwoFactorVerify({
  onSuccess,
  onError,
  title = "Two-Factor Authentication",
  description = "Enter the 6-digit code from your authenticator app",
  className,
}: TwoFactorVerifyProps) {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const isHydrated = useIsHydrated();

  const form = useForm({
    defaultValues: {
      code: "",
    },
    onSubmit: async ({ value }) => {
      try {
        // Validate with Zod schema
        const validated = twoFactorSchema.parse(value);

        const response = await (auth as any).twoFactor.verify({
          code: validated.code,
          fetchOptions: { throw: true },
        });

        if (response.error) {
          const errorMessage = response.error.message?.toLowerCase() || "";

          // If verification fails due to missing 2FA challenge (user didn't complete first login step),
          // redirect to sign-in to prevent bypassing the login flow
          if (
            errorMessage.includes("challenge") ||
            errorMessage.includes("session") ||
            errorMessage.includes("unauthorized") ||
            errorMessage.includes("invalid") ||
            errorMessage.includes("expired")
          ) {
            toast.error("Session Expired", {
              description: "Please sign in again to continue.",
            });
            // Redirect to sign-in after a short delay
            setTimeout(async () => {
              await navigate({ to: "/sign-in", replace: true });
            }, 1500);
            onError?.(response.error);
            return;
          }

          // Other errors (like invalid code) - just show error, don't redirect
          toast.error("Verification Failed", {
            description: response.error.message || "Invalid code. Please try again.",
          });
          form.reset();
          onError?.(response.error);
        } else {
          toast.success("Verified", {
            description: "Two-factor authentication verified successfully.",
          });
          await onSuccess?.();
        }
      } catch (error: any) {
        // Handle validation errors
        if (error?.issues) {
          // Zod validation errors are handled by field validators
          return;
        }

        // Handle network errors or other exceptions
        const errorMessage =
          error && typeof error === "object" && "message" in error
            ? String(error.message).toLowerCase()
            : "";

        // If it's a session/challenge related error, redirect to sign-in
        if (
          errorMessage.includes("challenge") ||
          errorMessage.includes("session") ||
          errorMessage.includes("unauthorized") ||
          errorMessage.includes("network")
        ) {
          toast.error("Session Expired", {
            description: "Please sign in again to continue.",
          });
          setTimeout(async () => {
            await navigate({ to: "/sign-in", replace: true });
          }, 1500);
          onError?.(error);
          return;
        }

        toast.error("Error", {
          description: "An unexpected error occurred. Please try again.",
        });
        form.reset();
        onError?.(error);
      }
    },
  });

  return (
    <div className={cn("grid w-full gap-6", className)}>
      {/* Remove redundant title/description section as it's usually provided by the parent card */}
      {(title !== "Two-Factor Authentication" ||
        description !== "Enter the 6-digit code from your authenticator app") && (
        <div className="space-y-2 text-center">
          <h2 className="font-bold text-2xl tracking-tight">{title}</h2>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      )}

      <form
        className={cn("grid w-full gap-4")}
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
              <Field
                className="flex flex-col items-center justify-center text-center"
                data-invalid={isInvalid}
              >
                <FieldLabel className="sr-only" htmlFor={field.name}>
                  Verification Code
                </FieldLabel>
                <InputOTP
                  containerClassName="justify-center"
                  maxLength={6}
                  onBlur={field.handleBlur}
                  onChange={(value) => field.handleChange(value)}
                  value={field.state.value}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
          name="code"
          validators={{
            onChange: twoFactorSchema.shape.code,
          }}
        />

        <Button className="w-full" disabled={form.state.isSubmitting} type="submit">
          {form.state.isSubmitting && <IconLoader className="mr-2 h-4 w-4 animate-spin" />}
          Verify Code
        </Button>
      </form>
    </div>
  );
}

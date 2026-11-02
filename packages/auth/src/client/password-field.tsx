import { useId, useState, type ReactNode } from "react";
import { Check, Circle } from "lucide-react";
import { useTranslations } from "@raypx/i18n/browser";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { PasswordInput, type PasswordInputProps } from "@raypx/ui/password-input";
import { authPolicy } from "../policy";

/** Own credential constraints and keep only validation feedback in state. */
export function PasswordField({
  label,
  labelAction,
  purpose,
  id,
  onChange,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
  ...props
}: Omit<PasswordInputProps, "labels" | "autoComplete" | "minLength" | "maxLength"> & {
  label: string;
  labelAction?: ReactNode;
  purpose: "current" | "new" | "confirm";
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const requirementsId = `${inputId}-requirements`;
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const [validLength, setValidLength] = useState<boolean | null>(null);
  const showRequirements = purpose === "new";
  const valid = validLength === true;
  const isInvalid = invalid || (showRequirements && validLength === false) || undefined;
  const Icon = valid ? Check : Circle;
  return (
    <Field data-disabled={props.disabled} data-invalid={isInvalid}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
        {labelAction}
      </div>
      <PasswordInput
        {...props}
        id={inputId}
        autoComplete={purpose === "current" ? "current-password" : "new-password"}
        minLength={purpose === "current" ? 1 : authPolicy.passwordMinLength}
        maxLength={authPolicy.passwordMaxLength}
        labels={{ show: c("showPassword"), hide: c("hidePassword"), capsLock: c("capsLockOn") }}
        aria-invalid={isInvalid}
        aria-describedby={
          [describedBy, showRequirements ? requirementsId : undefined].filter(Boolean).join(" ") ||
          undefined
        }
        onChange={(event) => {
          if (showRequirements) {
            const length = event.currentTarget.value.length;
            setValidLength(
              length === 0
                ? null
                : length >= authPolicy.passwordMinLength && length <= authPolicy.passwordMaxLength,
            );
          }
          onChange?.(event);
        }}
      />
      {showRequirements && (
        <p
          id={requirementsId}
          className="flex items-center gap-2 text-sm text-muted-foreground [&>svg]:size-4 [&>svg]:shrink-0"
        >
          <Icon aria-hidden="true" />
          {t(valid ? "passwordRequirementsMet" : "passwordRequirements", {
            min: String(authPolicy.passwordMinLength),
            max: String(authPolicy.passwordMaxLength),
          })}
        </p>
      )}
    </Field>
  );
}

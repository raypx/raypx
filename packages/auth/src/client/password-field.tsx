import { useId, useState, type ReactNode } from "react";
import { Check, Circle } from "lucide-react";
import { useTranslations } from "@raypx/i18n/browser";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { PasswordInput, type PasswordInputProps } from "@raypx/ui/password-input";
import { authPolicy } from "../policy";

/** Keep only the length for feedback; the input owns the credential. */
export function PasswordField({
  label,
  labelAction,
  newPassword = false,
  id,
  onChange,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
  ...props
}: Omit<PasswordInputProps, "labels"> & {
  label: string;
  labelAction?: ReactNode;
  newPassword?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const requirementsId = `${inputId}-requirements`;
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const [length, setLength] = useState(0);
  const valid = length >= authPolicy.passwordMinLength && length <= authPolicy.passwordMaxLength;
  const lengthInvalid = newPassword && length > 0 && !valid;
  const isInvalid = invalid || lengthInvalid || undefined;
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
        labels={{ show: c("showPassword"), hide: c("hidePassword"), capsLock: c("capsLockOn") }}
        aria-invalid={isInvalid}
        aria-describedby={
          [describedBy, newPassword ? requirementsId : undefined].filter(Boolean).join(" ") ||
          undefined
        }
        onChange={(event) => {
          setLength(event.currentTarget.value.length);
          onChange?.(event);
        }}
      />
      {newPassword && (
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

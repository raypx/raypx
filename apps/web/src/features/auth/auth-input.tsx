import type { ComponentProps, ReactNode } from "react";
import { Field, FieldLabel } from "@voidmix/ui/components/ui/field";
import { Input } from "@voidmix/ui/components/ui/input";

export function AuthInput({
  label,
  id,
  ...props
}: ComponentProps<typeof Input> & { id: string; label: ReactNode }) {
  return (
    <Field data-disabled={props.disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input required id={id} {...props} />
    </Field>
  );
}

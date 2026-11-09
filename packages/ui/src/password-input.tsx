import { useId, useState, type ComponentProps } from "react";
import { CapsLockIcon } from "@raypx/icons/caps-lock";
import { EyeIcon } from "@raypx/icons/eye";
import { EyeOffIcon } from "@raypx/icons/eye-off";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./components/ui/input-group.tsx";
import { IconButton } from "./icon-button.tsx";
import type { ControlSize } from "./control-size.ts";

export interface PasswordInputProps extends Omit<ComponentProps<"input">, "type"> {
  labels: { show: string; hide: string; capsLock?: string };
  controlSize?: ControlSize;
}

/** Input props and refs target the input; className sizes the whole control. */
export function PasswordInput({
  id,
  className,
  controlSize = "default",
  disabled,
  labels,
  onKeyDown,
  onKeyUp,
  onBlur,
  "aria-describedby": describedBy,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const showCapsLock = capsLock && !disabled && Boolean(labels.capsLock);
  const capsLockId = `${inputId}-caps-lock`;
  return (
    <InputGroup className={className} controlSize={controlSize}>
      <InputGroupInput
        autoCapitalize="none"
        spellCheck={false}
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        disabled={disabled}
        aria-describedby={
          [describedBy, showCapsLock ? capsLockId : undefined].filter(Boolean).join(" ") ||
          undefined
        }
        onKeyDown={(event) => {
          setCapsLock(event.getModifierState("CapsLock"));
          onKeyDown?.(event);
        }}
        onKeyUp={(event) => {
          setCapsLock(event.getModifierState("CapsLock"));
          onKeyUp?.(event);
        }}
        onBlur={(event) => {
          setCapsLock(false);
          onBlur?.(event);
        }}
        className="h-full"
      />
      <InputGroupAddon align="inline-end" className="py-0">
        {showCapsLock && (
          <span
            id={capsLockId}
            role="status"
            title={labels.capsLock}
            className="inline-flex [&>svg]:size-4"
          >
            <CapsLockIcon aria-hidden="true" />
            <span className="sr-only">{labels.capsLock}</span>
          </span>
        )}
        <IconButton
          type="button"
          size="icon-sm"
          label={visible ? labels.hide : labels.show}
          aria-controls={inputId}
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </IconButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

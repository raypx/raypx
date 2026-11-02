import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./components/ui/input-group";
import { IconButton } from "./icon-button";

export interface PasswordInputProps extends Omit<ComponentProps<"input">, "type"> {
  labels: { show: string; hide: string };
}

/** Input props and refs target the input; className sizes the whole control. */
export function PasswordInput({ id, className, disabled, labels, ...props }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup className={className}>
      <InputGroupInput
        autoCapitalize="none"
        spellCheck={false}
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className="h-full"
      />
      <InputGroupAddon align="inline-end" className="py-0">
        <IconButton
          type="button"
          size="icon-sm"
          label={visible ? labels.hide : labels.show}
          aria-controls={inputId}
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </IconButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

import { Input } from "@raypx/ui/components/input";
import { cn } from "@raypx/ui/lib/utils";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import type * as React from "react";
import { useId, useState } from "react";

function PasswordField({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const id = useId();
  const [isVisible, setIsVisible] = useState<boolean>(false);

  const toggleVisibility = () => {
    setIsVisible((prevState) => !prevState);
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        aria-describedby={`${id}-description`}
        className="pe-9"
        id={id}
        type={isVisible ? "text" : "password"}
        {...props}
      />
      <button
        aria-controls="password"
        aria-label={isVisible ? "Hide password" : "Show password"}
        aria-pressed={isVisible}
        className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-[color,box-shadow] hover:text-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        onClick={toggleVisibility}
        type="button"
      >
        {isVisible ? (
          <EyeSlash aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}

export { PasswordField };

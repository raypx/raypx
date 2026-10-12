import { Button, type ButtonProps } from "./components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  label: string;
  hint?: string;
  size?: "icon" | "icon-xs" | "icon-sm" | "icon-lg";
}

export function IconButton({
  label,
  hint = label,
  size = "icon",
  variant = "ghost",
  children,
  ...props
}: IconButtonProps) {
  return (
    <Tooltip disabled={props.disabled}>
      <TooltipTrigger
        data-slot="button"
        render={
          <Button
            {...props}
            aria-label={label}
            aria-description={hint === label ? undefined : hint}
            size={size}
            variant={variant}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent role="tooltip">{hint}</TooltipContent>
    </Tooltip>
  );
}

import { Info } from "@phosphor-icons/react";
import { Button } from "./components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "./components/ui/popover";

export function HelpHint({ label, description }: { label: string; description: string }) {
  return (
    <Popover>
      <PopoverTrigger
        data-slot="button"
        render={<Button aria-label={label} size="icon-sm" variant="ghost" />}
      >
        <Info aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>{label}</PopoverTitle>
        <PopoverDescription>{description}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}

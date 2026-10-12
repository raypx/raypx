import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps } from "react";
export interface SwitchProps extends ComponentProps<typeof BaseSwitch.Root> {
    size?: "default" | "sm";
}
declare function Switch({ className, size, ...props }: SwitchProps): any;
export { Switch };
//# sourceMappingURL=switch.d.ts.map
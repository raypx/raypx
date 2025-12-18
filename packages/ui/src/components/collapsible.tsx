"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { mergeProps } from "@base-ui/react/merge-props";
import { extractRenderProp } from "@raypx/ui/lib/utils";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  nativeButton,
  ...props
}: CollapsiblePrimitive.Trigger.Props & { asChild?: boolean; nativeButton?: boolean }) {
  const [renderProp, rest] = extractRenderProp(props);
  return (
    <CollapsiblePrimitive.Trigger
      nativeButton={nativeButton}
      render={renderProp}
      {...mergeProps({ "data-slot": "collapsible-trigger" }, rest)}
    />
  );
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };

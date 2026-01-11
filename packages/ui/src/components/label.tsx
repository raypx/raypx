"use client";

import type * as React from "react";

import { cn } from "@/utils";

function Label({ className, htmlFor, ...props }: React.ComponentProps<"label">) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: This is a reusable component; htmlFor should be provided via props when used
		<label
			className={cn(
				"flex select-none items-center gap-2 text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
				className,
			)}
			data-slot="label"
			htmlFor={htmlFor}
			{...props}
		/>
	);
}

export { Label };

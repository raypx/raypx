"use client";

import { cn } from "@raypx/ui/lib/utils";
import * as React from "react";
import { Label } from "./label";

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn("grid gap-2", className)} data-slot="form-item" {...props} />
    </FormItemContext.Provider>
  );
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn("data-[error=true]:text-destructive", className)}
      data-slot="form-label"
      {...props}
    />
  );
}

function FormControl({ ...props }: React.ComponentProps<"div">) {
  return <div data-slot="form-control" {...props} />;
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="form-description"
      {...props}
    />
  );
}

function FormMessage({ className, children, ...props }: React.ComponentProps<"p">) {
  if (!children) {
    return null;
  }

  return (
    <p className={cn("text-destructive text-sm", className)} data-slot="form-message" {...props}>
      {children}
    </p>
  );
}

export { FormItem, FormLabel, FormControl, FormDescription, FormMessage };

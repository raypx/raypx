import { useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@raypx/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@raypx/ui/components/alert-dialog";
import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import { Checkbox } from "@raypx/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@raypx/ui/components/dialog";
import { EmptyState } from "@raypx/ui/components/empty-state";
import { ErrorState } from "@raypx/ui/components/error-state";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@raypx/ui/components/field";
import { Input } from "@raypx/ui/components/input";
import { LoadingState } from "@raypx/ui/components/loading-state";
import { Progress } from "@raypx/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/select";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { toast } from "@raypx/ui/components/sonner";
import { Switch } from "@raypx/ui/components/switch";
import { Textarea } from "@raypx/ui/components/textarea";

/** Interactive presentation examples; values stay local and no requests are initiated. */
export function UIShowcase() {
  const id = useId();
  const [notifications, setNotifications] = useState(true);
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-12 space-y-8 border-t pt-8">
      <div className="space-y-2">
        <h2 id={`${id}-heading`} className="text-2xl font-semibold">
          Component foundation
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Form controls, feedback, and dialogs share the same theme and keyboard behavior.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => toast.success("Preview saved")}>Save preview</Button>
        <Button variant="outline">Secondary action</Button>
        <Button variant="ghost">Quiet action</Button>
        <Button disabled>Unavailable</Button>
        <Badge>Ready</Badge>
        <Badge variant="secondary">Draft</Badge>
      </div>

      <form
        className="max-w-xl"
        onSubmit={(event) => {
          event.preventDefault();
          toast.success("Preferences preview saved");
        }}
      >
        <FieldSet>
          <FieldLegend>Workspace preferences</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>Workspace name</FieldLabel>
              <Input
                id={`${id}-name`}
                name="name"
                defaultValue="Personal workspace"
                required
                aria-describedby={`${id}-name-help`}
              />
              <FieldDescription id={`${id}-name-help`}>
                Choose a name that helps you recognize this workspace.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-visibility`}>Visibility</FieldLabel>
              <Select defaultValue="private" name="visibility">
                <SelectTrigger id={`${id}-visibility`}>
                  <SelectValue placeholder="Choose visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
              <Textarea
                id={`${id}-description`}
                name="description"
                placeholder="What will you use this workspace for?"
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox id={`${id}-updates`} name="updates" />
              <FieldContent>
                <FieldLabel htmlFor={`${id}-updates`}>Product updates</FieldLabel>
                <FieldDescription>Receive occasional release notes.</FieldDescription>
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`${id}-notifications`}>Notifications</FieldLabel>
                <FieldDescription>Show alerts when work completes.</FieldDescription>
              </FieldContent>
              <Switch
                id={`${id}-notifications`}
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </Field>
            <Button type="submit" className="self-start">
              Save preferences
            </Button>
          </FieldGroup>
        </FieldSet>
      </form>

      <div className="max-w-xl space-y-4">
        <Alert>
          <AlertTitle>Changes are local</AlertTitle>
          <AlertDescription>
            This preview keeps your preferences in the current page.
          </AlertDescription>
        </Alert>
        <Field data-invalid="true">
          <FieldLabel htmlFor={`${id}-invalid-email`}>Email validation example</FieldLabel>
          <Input
            id={`${id}-invalid-email`}
            type="email"
            defaultValue="invalid"
            aria-invalid="true"
            aria-describedby={`${id}-email-error`}
          />
          <FieldError id={`${id}-email-error`}>Enter a valid email address.</FieldError>
        </Field>
        <div className="space-y-2">
          <p className="text-sm">Import progress</p>
          <Progress value={60} aria-label="Import progress" />
        </div>
        <div aria-hidden="true" className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Edit workspace</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit workspace</DialogTitle>
              <DialogDescription>
                Try a dialog with focus management and keyboard dismissal.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor={`${id}-dialog-name`}>Workspace name</FieldLabel>
              <Input id={`${id}-dialog-name`} defaultValue="Personal workspace" />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-dialog-visibility`}>Workspace visibility</FieldLabel>
              <Select defaultValue="private">
                <SelectTrigger id={`${id}-dialog-visibility`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>Save preview</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">Reset preview</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset this preview?</AlertDialogTitle>
              <AlertDialogDescription>
                This demonstrates confirmation before a destructive action. No saved data will
                change.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep preview</AlertDialogCancel>
              <AlertDialogAction onClick={() => toast.success("Preview reset")}>
                Reset preview
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="max-w-xl space-y-4">
        <EmptyState
          title="No projects yet"
          description="Create a project to organize your work."
          action={
            <Button onClick={() => toast.info("Project creation preview")}>Create project</Button>
          }
        />
        <ErrorState
          title="Could not load projects"
          description="Try again to refresh the list."
          action={
            <Button variant="outline" onClick={() => toast.info("Retry preview")}>
              Try again
            </Button>
          }
        />
        <LoadingState label="Loading projects" />
      </div>
    </section>
  );
}

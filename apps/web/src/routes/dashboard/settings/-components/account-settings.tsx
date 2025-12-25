import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@raypx/auth";
import { useTRPC } from "@raypx/trpc/client";
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
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@raypx/ui/components/form";
import { Input } from "@raypx/ui/components/input";
import { toast } from "@raypx/ui/components/toast";
import { IconUpload, IconUser } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAvatarUpload } from "~/hooks/use-avatar-upload";

const profileFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255, "Name is too long"),
  username: z
    .string()
    .trim()
    .min(1, "Username is required")
    .max(50, "Username is too long")
    .nullable()
    .optional(),
});

export function AccountSettings() {
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session, refetch: refetchSession } = useSession();
  const user = session?.user;
  const trpc = useTRPC();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, isLoading: isUploading, remove } = useAvatarUpload();

  const form = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: user?.name ?? "",
      username: (user as any)?.username ?? "",
    },
  });

  const updateProfileMutation = useMutation(trpc.users.updateProfile.mutationOptions());

  const onSubmit = async (values: z.infer<typeof profileFormSchema>) => {
    try {
      const updateData: {
        name?: string;
        username?: string | null;
      } = {};

      if (values.name !== user?.name) {
        updateData.name = values.name;
      }
      if (values.username !== (user as any)?.username) {
        updateData.username = values.username || null;
      }

      if (Object.keys(updateData).length > 0) {
        try {
          await updateProfileMutation.mutateAsync(updateData);
          toast.success("Profile updated successfully!");
          void refetchSession();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to update profile");
        }
      } else {
        toast.info("No changes were made to your profile.");
      }
    } catch {
      // Error already handled above
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    await upload(file);
  };

  const handleRemoveAvatar = async () => {
    await remove();
  };

  const userInitials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your account profile information and email address
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage alt={user?.name ?? ""} src={user?.image ?? undefined} />
              <AvatarFallback className="text-lg">
                {userInitials ? userInitials : <IconUser className="h-8 w-8" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <input
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
              <div className="flex gap-2">
                <Button
                  className="gap-2"
                  disabled={isUploading}
                  onClick={handleAvatarClick}
                  size="sm"
                  variant="outline"
                >
                  <IconUpload className="h-4 w-4" />
                  {isUploading ? "Uploading..." : "Upload new photo"}
                </Button>
                {user?.image && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost">
                        Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove profile picture?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove your current profile picture. This action cannot be
                          undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemoveAvatar}>Continue</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                JPG, PNG or GIF. Max size of 2MB. Will be compressed to ~400x400px.
              </p>
            </div>
          </div>

          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter your username"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>This is your public display name.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input
                    disabled
                    placeholder="Enter your email"
                    type="email"
                    value={user?.email ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Email changes require verification. Contact support to update your email.
                </FormDescription>
              </FormItem>

              <div className="flex gap-2 pt-2">
                <Button disabled={form.formState.isSubmitting} type="submit">
                  {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
                <Button onClick={() => form.reset()} type="button" variant="outline">
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Delete Account</CardTitle>
          <CardDescription>Permanently delete your account and all associated data</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <Button variant="destructive">Delete Account</Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { IconKey, IconShield } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type React from "react";
import { type Provider, socialProviders } from "../utils/social-providers";
import { ProviderButton } from "./provider-button";

export type SecurityPanelProps = {
  // Route to the in-app security settings page (e.g. "/_app/settings/")
  changePasswordTo?: string;
  // Optional search params for that page (e.g. { tab: "security" })
  changePasswordSearch?: Record<string, unknown>;
  // Route to the forgot password page (e.g. "/_auth/forgot-password")
  forgotPasswordTo?: string;
  // Limit shown social providers, default show common ones
  providers?: Provider["provider"][];
};

export function SecurityPanel({
  changePasswordTo = "/_app/settings/",
  changePasswordSearch,
  forgotPasswordTo = "/_auth/forgot-password",
  providers = ["github", "google"],
}: SecurityPanelProps): React.ReactNode {
  const filtered = socialProviders.filter((p) => providers.includes(p.provider));

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconKey className="h-5 w-5 text-muted-foreground" />
            Password & Security
          </CardTitle>
          <CardDescription>Quick actions for account security</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link params={{}} search={changePasswordSearch} to={changePasswordTo}>
            <Button variant="default">Change Password</Button>
          </Link>
          <Link to={forgotPasswordTo}>
            <Button variant="outline">Reset Password via Email</Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconShield className="h-5 w-5 text-muted-foreground" />
            Social Accounts
          </CardTitle>
          <CardDescription>Connect providers to enable social sign-in</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {filtered.map((provider) => (
            <ProviderButton key={provider.provider} provider={provider} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

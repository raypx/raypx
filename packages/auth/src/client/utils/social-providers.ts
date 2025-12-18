import { IconBrandDiscord, IconBrandGithub, IconBrandGoogle } from "@tabler/icons-react";

type ProviderIcon = typeof IconBrandGoogle;

export const socialProviders = [
  {
    provider: "discord",
    name: "Discord",
    icon: IconBrandDiscord,
  },
  {
    provider: "github",
    name: "GitHub",
    icon: IconBrandGithub,
  },
  {
    provider: "google",
    name: "Google",
    icon: IconBrandGoogle,
  },
] as const;

export type Provider = {
  provider: string;
  name: string;
  icon?: ProviderIcon;
};

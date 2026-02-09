import type { TablerIcon } from "@raypx/ui/components/icon";
import { IconBrandDiscord, IconBrandGithub, IconBrandGoogle } from "@tabler/icons-react";

export type Provider = {
  provider: "discord" | "github" | "google";
  name: string;
  icon?: TablerIcon;
};

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
] satisfies Provider[];

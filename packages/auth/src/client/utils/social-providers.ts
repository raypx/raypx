import {
  AppleIcon,
  DiscordIcon,
  GitHubIcon,
  GoogleIcon,
  MicrosoftIcon,
  type ProviderIcon,
  XIcon,
} from "../components/provider-icons";

export const socialProviders = [
  {
    provider: "apple",
    name: "Apple",
    icon: AppleIcon,
  },
  {
    provider: "discord",
    name: "Discord",
    icon: DiscordIcon,
  },
  {
    provider: "github",
    name: "GitHub",
    icon: GitHubIcon,
  },
  {
    provider: "google",
    name: "Google",
    icon: GoogleIcon,
  },
  {
    provider: "microsoft",
    name: "Microsoft",
    icon: MicrosoftIcon,
  },
  {
    provider: "twitter",
    name: "X",
    icon: XIcon,
  },
] as const;

export type Provider = {
  provider: string;
  name: string;
  icon?: ProviderIcon;
};

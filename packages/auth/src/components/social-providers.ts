import {
  IconBrandApple as AppleIcon,
  IconBrandDiscord as DiscordIcon,
  IconBrandDropbox as DropboxIcon,
  IconBrandFacebook as FacebookIcon,
  IconBrandGithub as GitHubIcon,
  IconBrandGitlab as GitLabIcon,
  IconBrandGoogle as GoogleIcon,
  IconBrandKick as KickIcon,
  IconBrandLinkedin as LinkedInIcon,
  IconBrandWindows as MicrosoftIcon,
  IconBrandReddit as RedditIcon,
  IconBrandSpotify as SpotifyIcon,
  IconBrandTiktok as TikTokIcon,
  IconBrandTwitch as TwitchIcon,
  IconBrandVk as VKIcon,
  IconBrandX as XIcon,
  IconBrandZoom as ZoomIcon,
} from "@tabler/icons-react"

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
    provider: "dropbox",
    name: "Dropbox",
    icon: DropboxIcon,
  },
  {
    provider: "facebook",
    name: "Facebook",
    icon: FacebookIcon,
  },
  {
    provider: "github",
    name: "GitHub",
    icon: GitHubIcon,
  },
  {
    provider: "gitlab",
    name: "GitLab",
    icon: GitLabIcon,
  },
  {
    provider: "google",
    name: "Google",
    icon: GoogleIcon,
  },
  {
    provider: "kick",
    name: "Kick",
    icon: KickIcon,
  },
  {
    provider: "linkedin",
    name: "LinkedIn",
    icon: LinkedInIcon,
  },
  {
    provider: "microsoft",
    name: "Microsoft",
    icon: MicrosoftIcon,
  },
  {
    provider: "reddit",
    name: "Reddit",
    icon: RedditIcon,
  },
  {
    provider: "spotify",
    name: "Spotify",
    icon: SpotifyIcon,
  },
  {
    provider: "tiktok",
    name: "TikTok",
    icon: TikTokIcon,
  },
  {
    provider: "twitch",
    name: "Twitch",
    icon: TwitchIcon,
  },
  {
    provider: "vk",
    name: "VK",
    icon: VKIcon,
  },
  {
    provider: "twitter",
    name: "X",
    icon: XIcon,
  },
  {
    provider: "zoom",
    name: "Zoom",
    icon: ZoomIcon,
  },
] as const

export type SocialProvider = (typeof socialProviders)[number]

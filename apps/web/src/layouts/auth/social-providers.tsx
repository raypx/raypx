import { ProviderButton, socialProviders } from "@raypx/auth";

interface SocialProvidersProps {
  redirectTo?: string;
  disabled?: boolean;
  providers?: ("github" | "google" | "discord" | "microsoft" | "apple")[];
}

export function SocialProviders({
  redirectTo,
  disabled = false,
  providers = ["github", "google"],
}: SocialProvidersProps) {
  const filteredProviders = socialProviders.filter((p) => providers.includes(p.provider as any));

  if (filteredProviders.length === 0) {
    return null;
  }

  return (
    <div className="grid w-full gap-3">
      {filteredProviders.map((provider) => (
        <ProviderButton
          disabled={disabled}
          key={provider.provider}
          provider={provider}
          redirectTo={redirectTo}
        />
      ))}
    </div>
  );
}

import { type Provider, ProviderButton, socialProviders } from "@raypx/auth";

interface SocialProvidersProps {
  redirectTo?: string;
  disabled?: boolean;
  providers?: Provider["provider"][];
}

export function SocialProviders({
  redirectTo,
  disabled = false,
  providers = ["github", "google"] as Provider["provider"][],
}: SocialProvidersProps) {
  const filteredProviders = socialProviders.filter((p) => providers.includes(p.provider));

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

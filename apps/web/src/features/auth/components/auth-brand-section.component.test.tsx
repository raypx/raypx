import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BrowserLanguageProvider } from "../../../i18n.js";
import en from "../../../../locales/en/guest.json" with { type: "json" };
import zh from "../../../../locales/zh/guest.json" with { type: "json" };
import { AuthBrandSection } from "./auth-brand-section.js";

afterEach(cleanup);

it.each(["en", "zh"] as const)(
  "describes the next deployment settings during bootstrap in %s",
  async (locale) => {
    const copy = { en, zh }[locale];
    render(
      <BrowserLanguageProvider initialPreference={locale} restorePreference={false}>
        <AuthBrandSection bootstrap />
      </BrowserLanguageProvider>,
    );
    await screen.findByRole("heading", { name: copy.bootstrapTitle });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    for (const key of ["bootstrapFactModel", "bootstrapFactSandbox", "bootstrapFactMail"] as const)
      expect(screen.getByText(copy[key])).toBeInTheDocument();
    expect(screen.queryByText(copy.authTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.authSummary)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.authFactAgents)).not.toBeInTheDocument();
  },
);

it.each(["en", "zh"] as const)(
  "keeps the ordinary authentication panel unchanged in %s",
  async (locale) => {
    const copy = { en, zh }[locale];
    render(
      <BrowserLanguageProvider initialPreference={locale} restorePreference={false}>
        <AuthBrandSection />
      </BrowserLanguageProvider>,
    );
    await screen.findByRole("heading", { name: copy.authTitle });
    expect(screen.getByText(copy.authSummary)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    for (const key of ["authFactAgents", "authFactControl", "authFactTogether"] as const)
      expect(screen.getByText(copy[key])).toBeInTheDocument();
    expect(screen.queryByText(copy.bootstrapTitle)).not.toBeInTheDocument();
  },
);

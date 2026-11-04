/** @vitest-environment happy-dom */
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { mocks, page } from "../tests/helpers/router-auth";

describe("public legal routes", () => {
  it("serves privacy outside the account shell when the API is unavailable", async () => {
    mocks.loadAccount.mockRejectedValue(new Error("API unavailable"));
    const router = await page("/privacy");
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeTruthy();
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      "__root__",
      "/(legal)",
      "/(legal)/privacy",
    ]);
    expect(screen.getByRole("link", { name: "Optional diagnostics" })).toHaveAttribute(
      "href",
      "/privacy#diagnostics",
    );
    expect(mocks.loadAccount).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.devices).not.toHaveBeenCalled();
    expect(mocks.tasks).not.toHaveBeenCalled();
    expect(mocks.configurationGet).not.toHaveBeenCalled();
  });

  it.each(["/", "/login", "/signup"])("links to privacy from %s", async (path) => {
    const router = await page(path);
    fireEvent.click(screen.getByRole("link", { name: "Privacy" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Privacy" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/privacy");
  });
});

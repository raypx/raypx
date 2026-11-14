import { expect, test, type Locator, type Page } from "@playwright/test";
import { selectOption } from "../helpers/select.js";

const actionTimeout = 5_000;
const apiUrl = process.env.CONTROL_E2E_API_URL;
const viewports = [
  { width: 1440, height: 860 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
];

/** Measure modal surfaces only after animation and responsive layout have settled. */
async function expectSurfaceGeometry(page: Page, surface: Locator) {
  await expect(surface).toBeVisible();
  const viewport = page.viewportSize()!;
  let previous: string | null = null;
  let stable = 0;
  await expect
    .poll(async () => {
      const box = await surface.boundingBox();
      if (!box) return false;
      const signature = [box.x, box.y, box.width, box.height]
        .map((value) => Math.round(value * 10))
        .join(":");
      stable = signature === previous ? stable + 1 : 0;
      previous = signature;
      return (
        stable >= 2 &&
        box.x >= -0.5 &&
        box.y >= -0.5 &&
        box.x + box.width <= viewport.width + 0.5 &&
        box.y + box.height <= viewport.height + 0.5
      );
    })
    .toBe(true);
  await expect
    .poll(() =>
      surface.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        const failures: string[] = [];
        const controls = node.querySelectorAll<HTMLElement>(
          "button, input, [role=combobox], [role=tab]",
        );
        for (const control of controls) {
          if (control.getClientRects().length === 0) continue;
          // Hidden form mirrors and disabled controls take no pointer input, so a hit test
          // passes through them without anything covering them.
          if (control.closest("[aria-hidden=true]") || control.matches(":disabled")) continue;
          if (control.getAttribute("aria-disabled") === "true") continue;
          if (getComputedStyle(control).pointerEvents === "none") continue;
          const box = control.getBoundingClientRect();
          if (box.width <= 1 || box.height <= 1) continue;
          // Scrollable settings may contain offscreen rows. Check each visible hit area.
          if (box.bottom <= bounds.top || box.top >= bounds.bottom) continue;
          const label = control.getAttribute("aria-label") ?? control.textContent ?? "Control";
          if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5)
            failures.push(`${label} extends outside its container`);
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          if (!hit || !control.contains(hit)) failures.push(`${label} is obscured`);
        }
        if (node.scrollWidth > node.clientWidth + 1) failures.push("Surface overflows");
        if (document.documentElement.scrollWidth > window.innerWidth)
          failures.push("Page overflows");
        return failures;
      }),
    )
    .toEqual([]);
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Space", exact: true }).click({ timeout: actionTimeout });
  await page
    .getByRole("menuitem", { name: "Space settings", exact: true })
    .click({ timeout: actionTimeout });
  const settings = page.getByRole("dialog", { name: "Space settings", exact: true });
  await expect(settings).toBeVisible();
  return settings;
}

async function section(page: Page, settings: Locator, name: string) {
  await selectOption(
    page,
    settings.getByRole("combobox", { name: "Section", exact: true }),
    name.toLowerCase(),
    { timeout: actionTimeout },
  );
}

/** One real-backend journey is consumed by both compiled renderer projects. */
export function registerTests() {
  // Invitation tokens must not enter trace archives, videos or failure screenshots.
  test.use({ trace: "off", screenshot: "off", video: "off" });
  test("shares a Space with another account and ends its open access immediately", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    test.skip(!apiUrl, "Requires the owned backend fixture from bun run test backends --with-e2e");
    if (!apiUrl || !baseURL) return;
    test.setTimeout(120_000);
    const origin = new URL(baseURL).origin;
    const memberEmail = `control-member-${info.project.name}@example.com`;
    const memberName = info.project.name === "web" ? "Web Space Member" : "Desktop Space Member";
    const ownerSession = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      timeout: actionTimeout,
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
    });
    expect(ownerSession.status()).toBe(200);
    await page.setViewportSize(viewports[0]!);
    await page.goto(`${baseURL}/agents`, { timeout: actionTimeout });
    await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible();

    const suffix = `${info.project.name}-${crypto.randomUUID()}`;
    const spaceName = `Shared Space 团队 ${suffix}`;
    await page
      .getByRole("button", { name: "Space", exact: true })
      .click({ timeout: actionTimeout });
    await page
      .getByRole("menuitem", { name: "New Space", exact: true })
      .click({ timeout: actionTimeout });
    const spaceForm = page.getByRole("dialog", { name: "New Space", exact: true });
    await spaceForm
      .getByRole("textbox", { name: "Space name", exact: true })
      .pressSequentially(spaceName, { timeout: actionTimeout });
    await spaceForm
      .getByRole("button", { name: "Create Space", exact: true })
      .click({ timeout: actionTimeout });
    await expect(spaceForm).toBeHidden();
    await expect(page.getByRole("button", { name: "Space", exact: true })).toContainText(spaceName);

    const agentName = `Shared Agent ${suffix}`;
    await page
      .getByRole("button", { name: "New Agent", exact: true })
      .click({ timeout: actionTimeout });
    const agentForm = page.getByRole("dialog", { name: "New Agent", exact: true });
    await agentForm
      .getByRole("textbox", { name: "Name", exact: true })
      .pressSequentially(agentName, { timeout: actionTimeout });
    await agentForm
      .getByRole("textbox", { name: "Instructions", exact: true })
      .pressSequentially("Reply briefly.", { timeout: actionTimeout });
    await selectOption(
      page,
      agentForm.getByRole("combobox", { name: "Model", exact: true }),
      "browser-fixture",
      { timeout: actionTimeout },
    );
    await agentForm
      .getByRole("button", { name: "Create Agent", exact: true })
      .click({ timeout: actionTimeout });
    await expect(agentForm).toBeHidden();
    await expect(page.locator("[data-conversation-header] h1")).toHaveText(agentName);

    const settings = await openSettings(page);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const name of ["General", "Members", "Invitations", "Approvals", "Audit"]) {
        await section(page, settings, name);
        await expectSurfaceGeometry(page, settings);
      }
    }
    await page.setViewportSize(viewports[0]!);
    await section(page, settings, "Invitations");
    await settings
      .getByRole("button", { name: "Create invitation", exact: true })
      .click({ timeout: actionTimeout });
    const invitation = page.getByRole("dialog", { name: "Invitation link", exact: true });
    const invitationLink = invitation.getByRole("textbox", {
      name: "Invitation link",
      exact: true,
    });
    await expect(invitationLink).toBeVisible();
    // Keep the one-time link only in memory. Never attach or log its value.
    const destination = await invitationLink.inputValue();
    const invitationUrl = new URL(destination, baseURL);
    expect(invitationUrl.pathname).toBe("/join");
    expect(invitationUrl.search).toBe("");
    expect(/^[a-f0-9]{64}$/.test(invitationUrl.hash.slice(1))).toBe(true);
    await expect(invitation.getByRole("button", { name: "Copy link", exact: true })).toBeEnabled();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expectSurfaceGeometry(page, invitation);
    }
    await invitation
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click({ timeout: actionTimeout });
    await expect(invitation).toBeHidden();
    await expect(invitationLink).toHaveCount(0);

    const memberContext = await browser.newContext({ locale: "en-US", viewport: viewports[0]! });
    try {
      const member = await memberContext.newPage();
      const memberSession = await member.request.post(`${apiUrl}/api/auth/sign-in/email`, {
        headers: { origin },
        timeout: actionTimeout,
        data: { email: memberEmail, password: "Raypx-control-test-123" },
      });
      expect(memberSession.status()).toBe(200);
      // Desktop shares Web links externally; route the same fragment into the
      // compiled renderer here so both project journeys exercise their own join UI.
      await member.goto(`${baseURL}/join${invitationUrl.hash}`, { timeout: actionTimeout });
      await expect(member.getByRole("heading", { name: spaceName, exact: true })).toBeVisible();
      await expect(member.getByText("Control Browser Test", { exact: false })).toBeVisible();
      await expect(member.getByText(/Connections and credentials stay personal/)).toBeVisible();
      const join = member.getByRole("button", { name: "Join Space", exact: true });
      await expect(join).toBeEnabled();
      await join.click({ timeout: actionTimeout });
      await expect(member.getByRole("button", { name: "Space", exact: true })).toContainText(
        spaceName,
      );
      await member
        .getByRole("button", { name: agentName, exact: true })
        .click({ timeout: actionTimeout });
      await expect(member.locator("[data-conversation-header] h1")).toHaveText(agentName);

      await page.setViewportSize(viewports[0]!);
      await section(page, settings, "Members");
      const memberRow = settings.locator("[data-member-id]").filter({ hasText: memberName });
      await expect(memberRow).toHaveCount(1);
      await expect(memberRow).toContainText(memberEmail);
      await page.keyboard.press("Escape");
      await expect(settings).toBeHidden();
      await expect(page.getByRole("button", { name: "Space", exact: true })).toBeFocused();
      const message = `A message shared with the team ${suffix}`;
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .pressSequentially(message, { timeout: actionTimeout });
      await page
        .getByRole("button", { name: "Send", exact: true })
        .click({ timeout: actionTimeout });
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await expect(member.getByText(message, { exact: true })).toBeVisible();
      await expect(member.getByText("Control Browser Test", { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: "Stop reply", exact: true })
        .click({ timeout: actionTimeout });

      const memberMessage = `A message from the departing member ${suffix}`;
      await member
        .getByRole("textbox", { name: "Message", exact: true })
        .pressSequentially(memberMessage, { timeout: 5_000 });
      await member.getByRole("button", { name: "Send", exact: true }).click({ timeout: 5_000 });
      await expect(page.getByText(memberMessage, { exact: true })).toBeVisible();
      await expect(page.getByText(memberName, { exact: true })).toBeVisible();
      await member
        .getByRole("button", { name: "Stop reply", exact: true })
        .click({ timeout: 5_000 });

      await openSettings(page);
      await section(page, settings, "Members");
      await memberRow
        .getByRole("button", { name: `Change role for ${memberName}`, exact: true })
        .click({ timeout: actionTimeout });
      const roleConfirmation = page.getByRole("alertdialog", {
        name: `Change role for ${memberName}?`,
        exact: true,
      });
      await roleConfirmation
        .getByRole("button", { name: "Make owner", exact: true })
        .click({ timeout: actionTimeout });
      await expect(roleConfirmation).toBeHidden();
      await expect(memberRow).toContainText("Owner");
      const memberSettings = await openSettings(member);
      await section(member, memberSettings, "Invitations");
      await expect(
        memberSettings.getByRole("button", { name: "Create invitation", exact: true }),
      ).toBeVisible();
      await member.keyboard.press("Escape");
      await expect(memberSettings).toBeHidden();

      await memberRow
        .getByRole("button", { name: `Change role for ${memberName}`, exact: true })
        .click({ timeout: actionTimeout });
      await roleConfirmation
        .getByRole("button", { name: "Make member", exact: true })
        .click({ timeout: actionTimeout });
      await expect(roleConfirmation).toBeHidden();
      await expect(
        memberRow.getByRole("button", { name: `Remove ${memberName}`, exact: true }),
      ).toBeEnabled();
      await openSettings(member);
      await section(member, memberSettings, "Members");
      await expect(
        memberSettings.getByText("control-e2e@example.com", { exact: true }),
      ).toHaveCount(0);
      await expect(memberSettings.getByText(memberEmail, { exact: true })).toHaveCount(0);
      await expect(memberSettings.getByRole("button", { name: /^Change role for / })).toHaveCount(
        0,
      );
      await expect(memberSettings.getByRole("button", { name: /^Remove / })).toHaveCount(0);
      const memberSections = memberSettings.getByRole("combobox", { name: "Section", exact: true });
      await memberSections.click({ timeout: actionTimeout });
      await expect(member.getByRole("option", { name: "Invitations", exact: true })).toHaveCount(0);
      await expect(member.getByRole("option", { name: "Audit", exact: true })).toHaveCount(0);
      await member.keyboard.press("Escape");
      await member.keyboard.press("Escape");
      await expect(memberSettings).toBeHidden();
      await expect(member.locator("[data-conversation-header] h1")).toHaveText(agentName);

      await memberRow
        .getByRole("button", { name: `Remove ${memberName}`, exact: true })
        .click({ timeout: actionTimeout });
      const removal = page.getByRole("alertdialog", { name: `Remove ${memberName}?`, exact: true });
      await expect(removal).toContainText(/access ends now/i);
      await expect(removal).toContainText(/pending approvals and running work/i);
      await expect(removal).toContainText(/routines.*paused/i);
      await removal
        .getByRole("button", { name: "Remove member", exact: true })
        .click({ timeout: actionTimeout });
      await expect(removal).toBeHidden();
      await expect(memberRow).toHaveCount(0);
      await expect(member.locator("[data-conversation-header] h1")).toHaveCount(0);
      await expect(member.getByRole("button", { name: "Space", exact: true })).not.toContainText(
        spaceName,
      );
      await expect(
        member.getByText(/^You were removed from this Space\.(?: Switched to another Space\.)?$/),
      ).toBeVisible();
      await expect(member.getByText(message, { exact: true })).toHaveCount(0);
      await member.reload({ timeout: actionTimeout });
      await expect(member.getByRole("button", { name: agentName, exact: true })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(settings).toBeHidden();
      await page.reload({ timeout: actionTimeout });
      await expect(page.getByText(memberMessage, { exact: true })).toBeVisible();
      await expect(
        page.getByText(`${memberName} (no longer in this Space)`, { exact: true }),
      ).toBeVisible();
    } finally {
      await memberContext.close();
    }
  });
}

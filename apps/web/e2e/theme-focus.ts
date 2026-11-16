import { expect, type Locator } from "@playwright/test";

/** Read the compiled styles and resolve tokens in the same browser/color space. */
async function controlStyle(surface: Locator) {
  return surface.evaluate((element) => {
    const css = getComputedStyle(element);
    const probe = document.createElement("span");
    document.body.append(probe);
    function color(token: string) {
      probe.style.color = css.getPropertyValue(`--${token}`);
      return getComputedStyle(probe).color;
    }
    const tokens = {
      ring: color("ring"),
      destructive: color("destructive"),
      halo: color("control-ring"),
      invalidHalo: color("control-invalid-ring"),
    };
    probe.remove();
    return {
      border: css.borderTopColor,
      borderWidth: css.borderTopWidth,
      shadow: css.boxShadow,
      tokens,
    };
  });
}

async function keyboardFocus(control: Locator) {
  await control.focus();
  // Move no data or selection: a real key event establishes keyboard modality.
  await control.press("ArrowRight");
  await expect(control).toBeFocused();
  expect(await control.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
}

function shadowPattern(color: string, width: number) {
  const literal = `${color} 0px 0px 0px ${width}px`;
  return new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
}

export async function expectEntryFocus(control: Locator, surface = control) {
  await keyboardFocus(control);
  const { tokens } = await controlStyle(surface);
  await expect(surface).toHaveCSS("border-top-color", tokens.ring);
  await expect(surface).toHaveCSS("border-top-width", "1px");
  await expect(surface).toHaveCSS("box-shadow", shadowPattern(tokens.halo, 3));
  return controlStyle(surface);
}

export async function expectKeyboardRing(control: Locator) {
  await keyboardFocus(control);
  const { tokens } = await controlStyle(control);
  await expect(control).toHaveCSS("box-shadow", shadowPattern(tokens.ring, 2));
  return controlStyle(control);
}

/** Pin validation state on the real rendered control without submitting a form. */
export async function expectInvalidBorder(
  control: Locator,
  surface = control,
  onState?: (focused: boolean) => Promise<void>,
  focusStates: readonly boolean[] = [false, true],
) {
  const previous = await control.getAttribute("aria-invalid");
  await control.evaluate((element) => element.setAttribute("aria-invalid", "true"));
  const states = [];
  let scopeTabIndex: string | null | undefined;
  try {
    for (const focused of focusStates) {
      if (focused) await keyboardFocus(control);
      else {
        scopeTabIndex = await control.evaluate((element) => {
          // A modal restores focus when blur leaves it on the document body.
          // Keep the unfocused measurement inside the existing focus boundary.
          const scope = element.closest<HTMLElement>(
            '[role="dialog"], [data-slot="combobox-content"]',
          );
          if (scope) {
            const previousTabIndex = scope.getAttribute("tabindex");
            scope.tabIndex = -1;
            scope.focus({ preventScroll: true });
            return previousTabIndex;
          }
          (element as HTMLElement).blur();
          return undefined;
        });
        await expect(control).not.toBeFocused();
      }
      const { tokens } = await controlStyle(surface);
      await expect(surface).toHaveCSS("border-top-color", tokens.destructive);
      await expect(surface).toHaveCSS("border-top-width", "1px");
      await expect(surface).toHaveCSS("box-shadow", shadowPattern(tokens.invalidHalo, 3));
      states.push({ focused, ...(await controlStyle(surface)) });
      await onState?.(focused);
    }
    return states;
  } finally {
    if (scopeTabIndex !== undefined)
      await control.evaluate((element, value) => {
        const scope = element.closest<HTMLElement>(
          '[role="dialog"], [data-slot="combobox-content"]',
        );
        if (value === null) scope?.removeAttribute("tabindex");
        else scope?.setAttribute("tabindex", value);
      }, scopeTabIndex);
    await control.evaluate((element, value) => {
      if (value === null) element.removeAttribute("aria-invalid");
      else element.setAttribute("aria-invalid", value);
    }, previous);
  }
}

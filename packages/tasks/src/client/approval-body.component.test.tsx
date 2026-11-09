import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { ApprovalBody } from "./approval-body.tsx";

it("counts one file for multiple edits and preserves the complete request after folding previews", async () => {
  localStorage.setItem("raypx_locale", "en");
  const user = userEvent.setup();
  const body = JSON.stringify({
    file_path: "src/delivery.ts",
    edits: [
      { old_string: "send(input);", new_string: "await persist(input);" },
      { old_string: "return;", new_string: "return receipt;" },
    ],
  });
  render(
    <BrowserLanguageProvider>
      <ApprovalBody request={{ kind: "permission", body }} />
    </BrowserLanguageProvider>,
  );
  expect(await screen.findByText("Files in preview: 1")).toBeVisible();
  const files = screen.getAllByRole("button", { name: /^src\/delivery.ts/ });
  expect(files).toHaveLength(2);
  for (const file of files) await user.click(file);
  expect(screen.queryByRole("cell", { name: "await persist(input);" })).toBeNull();
  await user.click(screen.getByRole("tab", { name: "Original request" }));
  expect(screen.getByText(body)).toBeVisible();
});

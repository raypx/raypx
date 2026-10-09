import { Button } from "@raypx/ui/components/button";
import { EmptyState } from "@raypx/ui/components/empty-state";
import { ErrorState } from "@raypx/ui/components/error-state";
import { LoadingState } from "@raypx/ui/components/loading-state";
import { Progress } from "@raypx/ui/components/progress";
import { cn } from "@raypx/ui/utils";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";

afterEach(cleanup);

test("asChild preserves anchor semantics without adding a button or button-only type", () => {
  render(
    <Button asChild>
      <a href="/projects">View projects</a>
    </Button>,
  );
  expect(screen.queryByRole("button")).toBeNull();
  const link = screen.getByRole("link", { name: "View projects" });
  expect(link.getAttribute("href")).toBe("/projects");
  expect(link.hasAttribute("type")).toBe(false);
});

test("progress exposes actual completion and normalizes custom maximums", () => {
  const { rerender } = render(<Progress value={25} max={50} aria-label="Import progress" />);
  const progress = screen.getByRole("progressbar", { name: "Import progress" });
  expect(progress.getAttribute("aria-valuenow")).toBe("25");
  expect(progress.getAttribute("aria-valuemax")).toBe("50");
  expect((progress.firstElementChild as HTMLElement).style.transform).toBe("translateX(-50%)");
  rerender(<Progress value={200} max={100} aria-label="Import progress" />);
  expect(progress.getAttribute("aria-valuenow")).toBe("100");
  rerender(<Progress value={null} aria-label="Import progress" />);
  expect(progress.hasAttribute("aria-valuenow")).toBe(false);
  expect(progress.getAttribute("data-state")).toBe("indeterminate");
});

test("empty and error states delegate actions to their consumer", () => {
  const retry = vi.fn<() => void>();
  render(
    <>
      <EmptyState title="No projects yet" description="Create your first project." />
      <ErrorState
        title="Could not load projects"
        description="Try again."
        action={<Button onClick={retry}>Retry loading</Button>}
      />
    </>,
  );
  expect(screen.getByRole("region", { name: "No projects yet" }).textContent).toContain(
    "Create your first project.",
  );
  expect(screen.getByRole("alert", { name: "Could not load projects" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
  expect(retry).toHaveBeenCalledOnce();
});

test("loading announces its label once and hides decorative placeholder content", () => {
  render(<LoadingState label="Loading projects" />);
  const status = screen.getByRole("status");
  expect(status.getAttribute("aria-busy")).toBe("true");
  expect(status.textContent).toBe("Loading projects");
  expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
});

test("cn merges conditional classes and resolves Tailwind conflicts", () => {
  expect(cn("px-2 text-sm", false, { "px-4": true }, "text-base")).toBe("px-4 text-base");
});

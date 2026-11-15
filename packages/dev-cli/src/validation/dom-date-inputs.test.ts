import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { discover } from "../repository.js";
import { workspaceFixtures } from "../../tests/helpers/workspace.js";
import { checkDomDateInputs, nativeDateInputViolations } from "./dom-date-inputs.js";

it.each(["date", "datetime-local", "month", "week", "time"])(
  "rejects native %s in DOM JSX and composed Input",
  (type) => {
    expect(
      nativeDateInputViolations(
        "control.tsx",
        `<><input type="${type}" /><Input type={'${type}'} /></>`,
      ),
    ).toHaveLength(2);
  },
);
it("finds hidden expressions, named constants, spreads and createElement without matching prose", () => {
  expect(
    nativeDateInputViolations(
      "control.tsx",
      `
    const kind = 'date' as const;
    const props = {type: kind};
    const other = { ...props };
    const a = <Input hidden {...other} />;
    const b = <input type={enabled ? 'time' : 'text'} />;
    const c = React.createElement('input', props);
    const d = createElement(Input, {type: \`month\`});
  `,
    ),
  ).toHaveLength(4);
  expect(
    nativeDateInputViolations(
      "safe.tsx",
      `
    // <input type="date" />
    const example = '<input type="date" />';
    const a = <input type="hidden" value="2026-11-15" />;
    const b = <Input type="text" />;
    const c = <DatePicker value="2026-11-15" />;
  `,
    ),
  ).toEqual([]);
});
const { fixture, member } = workspaceFixtures();
it("discovers shared DOM workspaces while excluding native applications and test fixtures", () => {
  const root = fixture();
  const dom = member(root, "dom");
  const native = member(root, "native", { deps: { "react-native": "catalog:mobile" } });
  for (const path of [dom, native])
    writeFileSync(join(root, path, "src/control.tsx"), '<input type="date" />');
  writeFileSync(join(root, dom, "src/control.component.test.tsx"), '<input type="time" />');
  expect(checkDomDateInputs(root, discover(root))).toEqual([
    "packages/dom/src/control.tsx:1: native date/time input is forbidden in DOM UI; use @raypx/ui/date-picker and UI Input/Select for time",
  ]);
});

it("rejects programmatic DOM input types and HTML case variants", () => {
  expect(
    nativeDateInputViolations(
      "control.ts",
      `
    const input = document.createElement('input');
    input.type = 'DATE';
    input.setAttribute('type', 'datetime-local');
  `,
    ),
  ).toHaveLength(2);
});

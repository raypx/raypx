import { expect, it } from "vitest";
import { fillPageForm } from "./forms.js";

it("writes literal values only to unique named text fields in saved forms", () => {
  const output = fillPageForm(
    '<form><input name="company"><textarea name="memo">Old</textarea></form>',
    [
      { name: "company", value: 'A &quot; B "C"' },
      { name: "memo", value: '</textarea><img src="x">' },
    ],
  );
  expect(output).toContain('value="A &amp;quot; B &quot;C&quot;"');
  expect(output).toContain('&lt;/textarea&gt;&lt;img src="x"&gt;</textarea>');
});

it.each([
  '<form><input name="value"><input name="value"></form>',
  '<form><input type="password" name="value"></form>',
  '<form><input disabled name="value"></form>',
  '<input name="value">',
])("refuses ambiguous or unavailable controls in %s", (html) => {
  expect(() => fillPageForm(html, [{ name: "value", value: "Draft" }])).toThrow(
    "PAGE_INVALID_INPUT",
  );
});

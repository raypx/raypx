# Combobox

Import from `@raypx/ui/components/ui/combobox` for searchable selection from a
known set of options. Use `SelectField` when a short list needs no search.
Raypx's components wrap Base UI and use the shared control sizes and theme.
[Implementation](../../../packages/ui/src/components/ui/combobox.tsx) ·
[Base UI API](https://base-ui.com/react/components/combobox)

## Composition

- Give the trigger and search input distinct accessible names. Use a visible
  `FieldLabel` where space permits and reference it from the trigger and popup
  with `aria-labelledby`. Compose the popup with
  `ComboboxContent`, `ComboboxInput`, `ComboboxEmpty` and `ComboboxList`.
- Pass the groups to `items`. Render `ComboboxGroup` with its own label and use
  `ComboboxCollection` for the group's items so it follows the filtered list.
  Set `disabled` on individual unavailable choices.
- For object values, supply the display label and a stable identity through
  `itemToStringLabel`, `itemToStringValue` and `isItemEqualToValue`. Keep the
  search string separate from the selected value. The caller supplies translated
  labels and owns asynchronous loading, errors and retries.
- Use searchable controls where the feature needs them. The current Agent model
  picker uses UI Select, groups member/deployment offers and preserves the opaque
  returned model ID; it is not this Combobox.

## Examples and verification

Run `bun run dev:storybook` and open **Primitives → Combobox**.
[Grouped Search](http://localhost:6006/?path=/story/primitives-combobox--grouped-search)
is a manual example. [Keyboard Selection](http://localhost:6006/?path=/story/primitives-combobox--keyboard-selection)
runs its interaction checks when opened. Use the theme toolbar to preview both
light and dark. [Story source](../../../apps/storybook/src/stories/combobox.stories.tsx)

| Surface                                                               | Behavior covered                                                                                                                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Storybook](../../../apps/storybook/src/stories/combobox.stories.tsx) | Keyboard opening, labelled groups, disabled items, filtered choices, the active option relationship, Enter selection, and Escape from empty results with focus and selection preserved. |

The server-owned client replacement removes the project/task browser cases. The retained
component tests above cover the device-runtime picker; native WebView and IPC
acceptance remain separate packaged gates.

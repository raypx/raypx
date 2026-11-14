import type { ReactElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

export { act };

/** Native host rendering: no browser or DOM adapters enter these tests. */
export async function renderNative(element: ReactElement) {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(element, {
      createNodeMock: () => ({
        focus() {},
        blur() {},
        setNativeProps() {},
        scrollTo() {},
        scrollToEnd() {},
        scrollToIndex() {},
        scrollToOffset() {},
      }),
    });
  });
  return {
    get root() {
      return renderer.root;
    },
    async update(next: ReactElement) {
      await act(async () => renderer.update(next));
    },
    async unmount() {
      await act(async () => renderer.unmount());
    },
  };
}

export function findByLabel(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.find(
    (node) => typeof node.type === "string" && node.props.accessibilityLabel === label,
  );
}

function disabled(node: ReactTestInstance) {
  return Boolean(
    node.props.isDisabled || node.props.disabled || node.props.accessibilityState?.disabled,
  );
}

export async function press(node: ReactTestInstance) {
  if (disabled(node)) return;
  await act(async () => {
    node.props.onPress?.();
  });
}

export async function changeText(node: ReactTestInstance, value: string) {
  if (disabled(node) || node.props.editable === false) return;
  await act(async () => {
    node.props.onChangeText?.(value);
  });
}

export function textContent(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textContent(child)))
    .join("");
}

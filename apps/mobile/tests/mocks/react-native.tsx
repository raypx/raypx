import { createElement, forwardRef, type ElementType, type ReactNode } from "react";
import { vi } from "vitest";

export interface NativeProps {
  children?: ReactNode;
  [key: string]: unknown;
}

/** Preserve native props so tests assert controls, callbacks and accessibility. */
export function host(name: string) {
  const Component = forwardRef<unknown, NativeProps>((props, ref) =>
    createElement(name as ElementType, { ...props, ref }),
  );
  Component.displayName = name;
  return Component;
}

export const View = host("View");
export const Text = host("Text");
export const TextInput = host("TextInput");
export const Pressable = host("Pressable");
export const TouchableHighlight = host("TouchableHighlight");
export const TouchableOpacity = host("TouchableOpacity");
export const ScrollView = host("ScrollView");
export const KeyboardAvoidingView = host("KeyboardAvoidingView");
export const ImageBackground = host("ImageBackground");
export const Image = Object.assign(host("Image"), {
  getSize: vi.fn((_uri: string, success: (width: number, height: number) => void) =>
    success(100, 100),
  ),
});
export const RefreshControl = host("RefreshControl");
export const ActivityIndicator = host("ActivityIndicator");

export function Modal(props: NativeProps) {
  if (props.visible === false) return null;
  return createElement("Modal" as ElementType, props);
}

function slot(value: unknown): ReactNode {
  if (typeof value === "function") return createElement(value as ElementType);
  return value as ReactNode;
}

export const FlatList = forwardRef<unknown, NativeProps>((props, ref) => {
  const data = (props.data ?? []) as readonly unknown[];
  const render = props.renderItem as
    | ((item: { item: unknown; index: number }) => ReactNode)
    | undefined;
  return createElement("FlatList" as ElementType, { ...props, ref }, [
    slot(props.ListHeaderComponent),
    data.length
      ? data.map((item, index) => render?.({ item, index }))
      : slot(props.ListEmptyComponent),
    slot(props.ListFooterComponent),
  ]);
});
FlatList.displayName = "FlatList";

export const Alert = { alert: vi.fn() };
export const Linking = { openURL: vi.fn(async () => {}), canOpenURL: vi.fn(async () => true) };
export const Platform = {
  OS: "ios",
  select: (values: Record<string, unknown>) => values.ios ?? values.default,
};
export const Keyboard = { dismiss: vi.fn(), addListener: vi.fn(() => ({ remove() {} })) };
export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  flatten: (style: unknown) => style,
  absoluteFill: {},
  absoluteFillObject: {},
  hairlineWidth: 1,
};
function readDimensions() {
  return {
    width: 375,
    height: 812,
    scale: 1,
    fontScale: 1,
  };
}
export const useWindowDimensions = vi.fn(readDimensions);
export const useColorScheme = () => "light";
export const I18nManager = { isRTL: false };
export const Dimensions = { get: readDimensions };
export const AccessibilityInfo = {
  isReduceMotionEnabled: vi.fn(async () => true),
  announceForAccessibility: vi.fn(),
  addEventListener: vi.fn(() => ({ remove() {} })),
};

const appStateListeners = new Set<(state: string) => void>();
export const AppState = {
  currentState: "active",
  addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  }),
};

export function emitAppState(state: string) {
  AppState.currentState = state;
  for (const listener of appStateListeners) listener(state);
}

import { createContext, createElement, useContext, type ReactNode } from "react";
import { host, type NativeProps } from "./react-native.js";

const NativeButton = host("Button");
const NativeText = host("Text");
const NativeView = host("View");

export const Button = Object.assign(NativeButton, { Label: NativeText });
export const Input = host("TextInput");
export const TextArea = host("TextInput");
export const TextField = Object.assign(host("TextField"), {
  Input,
  Label: NativeText,
  ErrorMessage: NativeText,
});
export const Label = Object.assign(host("Label"), { Text: NativeText });
export const Spinner = host("Spinner");
export const Switch = Object.assign(host("Switch"), {
  Thumb: host("SwitchThumb"),
  Track: host("SwitchTrack"),
});
export const Avatar = Object.assign(host("Avatar"), { Image: host("Image"), Fallback: NativeText });

const SelectContext = createContext<((value: unknown) => void) | undefined>(undefined);
function SelectRoot({ children, ...props }: NativeProps) {
  return createElement(
    SelectContext.Provider,
    { value: props.onValueChange as ((value: unknown) => void) | undefined },
    createElement(hostSelect, props, children),
  );
}
const hostSelect = host("Select");
function SelectItem({ children, ...props }: NativeProps) {
  const change = useContext(SelectContext);
  return createElement(
    NativeButton,
    {
      ...props,
      onPress: () => change?.({ value: props.value, label: props.label ?? props.value }),
    },
    children,
  );
}
export const Select = Object.assign(SelectRoot, {
  Trigger: NativeButton,
  TriggerIndicator: NativeText,
  Value: NativeText,
  Portal: NativeView,
  Overlay: NativeView,
  Content: NativeView,
  Item: SelectItem,
  ItemLabel: NativeText,
  ItemIndicator: NativeText,
  Close: NativeButton,
});

export const RadioGroup = Object.assign(host("RadioGroup"), {
  Item: Object.assign(host("RadioItem"), { Indicator: host("RadioIndicator") }),
});
export const BottomSheet = Object.assign(host("BottomSheet"), {
  Portal: NativeView,
  Overlay: NativeView,
  Content: NativeView,
  Title: NativeText,
  Description: NativeText,
  Trigger: NativeButton,
  Close: NativeButton,
});

export function useThemeColor(value: string) {
  return value;
}
export function HeroUINativeProviderRaw({ children }: { children?: ReactNode }) {
  return children;
}

import { host } from "./react-native.js";

export const SafeAreaView = host("SafeAreaView");
export const SafeAreaProvider = host("SafeAreaProvider");
export const useSafeAreaInsets = () => ({ top: 24, right: 0, bottom: 34, left: 0 });

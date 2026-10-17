import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPreferenceStore } from "./preference-store";

export const devicePreferences = createPreferenceStore(AsyncStorage);

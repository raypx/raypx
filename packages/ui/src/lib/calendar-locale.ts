import type { Locale } from "date-fns/locale";
import { enUS } from "date-fns/locale/en-US";
import { useSyncExternalStore } from "react";

let currentLocale: Locale = enUS;

const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => currentLocale;

export const setCalendarLocale = (locale: Locale) => {
  currentLocale = locale;
  emit();
};

export const useCalendarLocale = (): Locale => {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const getCalendarLocale = () => currentLocale;

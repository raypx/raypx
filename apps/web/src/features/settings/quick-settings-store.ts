import { create } from "zustand";

interface QuickSettingsStore {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
  toggleModal: () => void;
}

/**
 * Zustand store for managing quick settings modal state.
 * Provides global access to modal open/close controls.
 */
export const useQuickSettingsStore = create<QuickSettingsStore>((set) => ({
  open: false,
  openModal: () => set({ open: true }),
  closeModal: () => set({ open: false }),
  toggleModal: () => set((state) => ({ open: !state.open })),
}));

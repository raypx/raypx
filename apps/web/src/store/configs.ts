import type { Config } from "@raypx/database/schemas";
import type { SortingState } from "@tanstack/react-table";
import { create } from "zustand";

export type ConfigItem = Config;

interface ConfigFormData {
  key: string;
  value: string;
  valueType: "string" | "number" | "boolean" | "json";
  description: string;
  isSecret: boolean;
  changeReason: string;
}

interface ConfigsStore {
  // Dialog states
  isCreateDialogOpen: boolean;
  isEditDialogOpen: boolean;
  isHistoryDialogOpen: boolean;
  deleteConfirmOpen: boolean;
  configToDelete: ConfigItem | null;
  editingConfig: ConfigItem | null;
  historyConfigId: string | null;

  // Form state
  formData: ConfigFormData;

  // Search, filter, pagination, and sorting state
  searchValue: string;
  q: string;
  valueTypeFilters: string[];
  isSecretFilter: boolean | undefined;
  sorting: SortingState;
  page: number;
  pageSize: number;

  // Actions
  setCreateDialogOpen: (open: boolean) => void;
  setEditDialogOpen: (open: boolean) => void;
  setHistoryDialogOpen: (open: boolean) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
  setConfigToDelete: (config: ConfigItem | null) => void;
  setEditingConfig: (config: ConfigItem | null) => void;
  setHistoryConfigId: (id: string | null) => void;

  updateFormData: (data: Partial<ConfigFormData>) => void;
  resetForm: () => void;

  setSearchValue: (value: string) => void;
  setQ: (value: string) => void;
  setValueTypeFilters: (filters: string[]) => void;
  setIsSecretFilter: (filter: boolean | undefined) => void;
  setSorting: (sorting: SortingState) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;

  // Reset all state
  reset: () => void;
}

const initialFormData: ConfigFormData = {
  key: "",
  value: "",
  valueType: "string",
  description: "",
  isSecret: false,
  changeReason: "",
};

export const useConfigsStore = create<ConfigsStore>()((set) => ({
  // Initial dialog states
  isCreateDialogOpen: false,
  isEditDialogOpen: false,
  isHistoryDialogOpen: false,
  deleteConfirmOpen: false,
  configToDelete: null,
  editingConfig: null,
  historyConfigId: null,

  // Initial form state
  formData: initialFormData,

  // Initial search, filter, pagination, and sorting state
  searchValue: "",
  q: "",
  valueTypeFilters: [],
  isSecretFilter: undefined,
  sorting: [{ id: "key", desc: false }],
  page: 1,
  pageSize: 10,

  // Dialog actions
  setCreateDialogOpen: (open) => set({ isCreateDialogOpen: open }),
  setEditDialogOpen: (open) => set({ isEditDialogOpen: open }),
  setHistoryDialogOpen: (open) => set({ isHistoryDialogOpen: open }),
  setDeleteConfirmOpen: (open) => set({ deleteConfirmOpen: open }),
  setConfigToDelete: (id) => set({ configToDelete: id }),
  setEditingConfig: (id) => set({ editingConfig: id }),
  setHistoryConfigId: (id) => set({ historyConfigId: id }),

  // Form actions
  updateFormData: (data) =>
    set((state) => ({
      formData: { ...state.formData, ...data },
    })),
  resetForm: () => set({ formData: initialFormData }),

  // Search, filter, pagination, and sorting actions
  setSearchValue: (value) => set({ searchValue: value }),
  setQ: (value) => set({ q: value }),
  setValueTypeFilters: (filters) => set({ valueTypeFilters: filters }),
  setIsSecretFilter: (filter) => set({ isSecretFilter: filter }),
  setSorting: (sorting) => set({ sorting }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),

  // Reset all state
  reset: () =>
    set({
      isCreateDialogOpen: false,
      isEditDialogOpen: false,
      isHistoryDialogOpen: false,
      deleteConfirmOpen: false,
      configToDelete: null,
      editingConfig: null,
      historyConfigId: null,
      formData: initialFormData,
      searchValue: "",
      q: "",
      valueTypeFilters: [],
      isSecretFilter: undefined,
      sorting: [{ id: "key", desc: false }],
      page: 1,
      pageSize: 10,
    }),
}));

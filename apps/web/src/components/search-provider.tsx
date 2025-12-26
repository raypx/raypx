"use client";

import { createContext, useContext, useState } from "react";
import { CommandMenu } from "~/layouts/dashboard/command-menu";

interface SearchContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const SearchContext = createContext<SearchContextType | null>(null);

interface Props {
  children: React.ReactNode;
}

export function SearchProvider({ children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <SearchContext.Provider value={{ open, setOpen }}>
      {children}
      <CommandMenu />
    </SearchContext.Provider>
  );
}

export const useSearch = () => {
  const searchContext = useContext(SearchContext);

  if (!searchContext) {
    throw new Error("useSearch has to be used within <SearchProvider>");
  }

  return searchContext;
};


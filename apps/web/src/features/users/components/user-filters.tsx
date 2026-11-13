import { useRef, useState } from "react";
import { CloseIcon } from "@raypx/icons/close";
import { SearchIcon } from "@raypx/icons/search";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/ui/input-group";
import { SelectField } from "@raypx/ui/select-field";
import { useTranslations } from "../../../i18n.js";
import type { UserSortDirection } from "./user-table.js";

export type UserFiltersValue = {
  search: { field: "email" | "name"; value: string } | null;
  verification: "all" | "verified" | "unverified";
  sortDirection: UserSortDirection;
};

export function UserFilters({
  filters,
  onChange,
}: {
  filters: UserFiltersValue;
  onChange: (filters: UserFiltersValue) => void;
}) {
  const c = useTranslations("common");
  const t = useTranslations("users");
  const [field, setField] = useState<"email" | "name">("email");
  const [draft, setDraft] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const { search, verification, sortDirection } = filters;
  const searchLabel = search
    ? `${search.field === "email" ? t("email") : c("name")}: ${search.value}`
    : null;
  const isFiltered = search !== null || verification !== "all";

  function clearSearch(clearVerification = false) {
    setDraft("");
    onChange({ ...filters, search: null, verification: clearVerification ? "all" : verification });
    searchInput.current?.focus();
  }

  return (
    <form
      aria-label={t("filters")}
      className="flex flex-col gap-3 border-b border-border p-3 @xl/main:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const value = draft.trim();
        onChange({ ...filters, search: value ? { field, value } : null });
      }}
    >
      <FieldGroup className="grid grid-cols-2 items-end gap-3 @xl/main:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)_auto] @3xl/main:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)_auto_minmax(9rem,auto)_minmax(9rem,auto)]">
        <Field className="min-w-0 @max-xl/main:col-span-2">
          <FieldLabel htmlFor="user-search-field">{t("searchBy")}</FieldLabel>
          <SelectField
            id="user-search-field"
            value={field}
            onValueChange={setField}
            options={[
              { value: "email", label: t("email") },
              { value: "name", label: c("name") },
            ]}
          />
        </Field>
        <Field className="min-w-0 @max-xl/main:col-span-2">
          <FieldLabel htmlFor="user-search">{t("search")}</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchInput}
              id="user-search"
              value={draft}
              maxLength={320}
              onChange={(event) => setDraft(event.target.value)}
            />
          </InputGroup>
        </Field>
        <Button type="submit" variant="outline" className="@max-xl/main:col-span-2">
          {t("search")}
        </Button>
        <Field className="min-w-0">
          <FieldLabel htmlFor="user-verification">{t("verification")}</FieldLabel>
          <SelectField
            id="user-verification"
            value={verification}
            onValueChange={(value) => onChange({ ...filters, verification: value })}
            options={[
              { value: "all", label: t("anyVerification") },
              { value: "verified", label: t("verified") },
              { value: "unverified", label: t("unverified") },
            ]}
          />
        </Field>
        <Field className="min-w-0">
          <FieldLabel htmlFor="user-sort">{t("created")}</FieldLabel>
          <SelectField
            id="user-sort"
            value={sortDirection}
            onValueChange={(value) => onChange({ ...filters, sortDirection: value })}
            options={[
              { value: "desc", label: t("newestFirst") },
              { value: "asc", label: t("oldestFirst") },
            ]}
          />
        </Field>
      </FieldGroup>
      {isFiltered && (
        <div
          role="group"
          aria-label={t("appliedFilters")}
          className="flex flex-wrap items-center gap-2"
        >
          {searchLabel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-w-full"
              aria-label={t("removeFilter", { filter: searchLabel })}
              onClick={() => clearSearch()}
            >
              <span className="min-w-0 truncate">{searchLabel}</span>
              <CloseIcon aria-hidden="true" data-icon="inline-end" />
            </Button>
          )}
          {verification !== "all" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={t("removeFilter", { filter: t(verification) })}
              onClick={() => {
                onChange({ ...filters, verification: "all" });
                searchInput.current?.focus();
              }}
            >
              {t(verification)}
              <CloseIcon aria-hidden="true" data-icon="inline-end" />
            </Button>
          )}
          {search && verification !== "all" && (
            <Button type="button" variant="ghost" size="sm" onClick={() => clearSearch(true)}>
              {t("clearFilters")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export interface SearchProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export interface EmptyProps {
  message?: string;
  component?: React.ReactNode;
}

export interface ErrorProps {
  message?: string;
  component?: React.ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
}

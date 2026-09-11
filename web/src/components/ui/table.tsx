import { type ReactNode, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Button } from '@/components/ui/button';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  sortValue?: (row: T) => string | number;
  width?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  caption?: string;
  dense?: boolean;
  footer?: ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'Nothing to show yet',
  emptyDescription,
  emptyAction,
  onRowClick,
  pageSize = 0,
  caption,
  dense = false,
  footer,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (typeof left === 'number' && typeof right === 'number') return sort.direction === 'asc' ? left - right : right - left;
      return sort.direction === 'asc' ? String(left).localeCompare(String(right)) : String(right).localeCompare(String(left));
    });
    return copy;
  }, [rows, sort, columns]);

  const total = pageSize > 0 ? sorted.length : 0;
  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const visible = pageSize > 0 ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  if (loading && rows.length === 0) return <div className="p-4"><LoadingRows rows={5} /></div>;

  return (
    <div>
      <div className="table-scroll">
        <table className="table-base">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    className={cn(
                      'table-th',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.hideBelow === 'sm' && 'hidden sm:table-cell',
                      column.hideBelow === 'md' && 'hidden md:table-cell',
                      column.hideBelow === 'lg' && 'hidden lg:table-cell',
                      column.headerClassName,
                    )}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        className={cn('inline-flex items-center gap-1 hover:text-ink-800', active && 'text-brand-900')}
                        onClick={() =>
                          setSort((current) =>
                            current?.key === column.key
                              ? current.direction === 'asc'
                                ? { key: column.key, direction: 'desc' }
                                : null
                              : { key: column.key, direction: 'asc' },
                          )
                        }
                        aria-label={`Sort by ${typeof column.header === 'string' ? column.header : column.key}`}
                      >
                        {column.header}
                        {active ? (
                          sort?.direction === 'asc' ? (
                            <ChevronUp className="size-3.5" aria-hidden />
                          ) : (
                            <ChevronDown className="size-3.5" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr
                key={rowKey(row)}
                className={cn('table-row', onRowClick && 'table-row-link cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter') onRowClick(row);
                      }
                    : undefined
                }
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'table-td',
                      dense && 'py-2',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.hideBelow === 'sm' && 'hidden sm:table-cell',
                      column.hideBelow === 'md' && 'hidden md:table-cell',
                      column.hideBelow === 'lg' && 'hidden lg:table-cell',
                      column.cellClassName,
                    )}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <div className="p-4">
          <ErrorState message={error} onRetry={onRetry} compact />
        </div>
      ) : null}

      {!error && visible.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : null}

      {footer}

      {pageSize > 0 && total > pageSize ? (
        <div className="flex items-center justify-between gap-3 border-t border-ink-200 px-4 py-2.5">
          <p className="micro">
            Showing {safePage * pageSize + 1}–{Math.min(total, (safePage + 1) * pageSize)} of {total}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="quiet" size="sm" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={safePage === 0} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="micro tnum">
              {safePage + 1} / {pageCount}
            </span>
            <Button variant="quiet" size="sm" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={safePage >= pageCount - 1} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

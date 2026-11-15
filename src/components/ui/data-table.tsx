/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generic table built on TanStack Table: column sorting, a search box,
 * optional row selection and paging, rendered with the shared Table styles.
 */

import * as React from 'react';
import {
  ColumnDef,
  RowSelectionState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { Input } from './input';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { cn } from '@/src/lib/utils';

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  searchPlaceholder?: string;
  /** Hide the search box */
  hideSearch?: boolean;
  pageSize?: number;
  /** Enable checkbox selection; receives the selected rows */
  onSelectionChange?: (rows: T[]) => void;
  /** Controlled selection by row id (requires getRowId) */
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  getRowId?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  emptyMessage?: React.ReactNode;
  toolbar?: React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = 'Search…',
  hideSearch,
  pageSize = 25,
  onSelectionChange,
  selectedIds,
  onSelectedIdsChange,
  getRowId,
  rowClassName,
  emptyMessage = 'Nothing to show.',
  toolbar,
  className
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [internalSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const controlled = !!onSelectedIdsChange;
  const selectable = !!onSelectionChange || controlled;
  const rowSelection: RowSelectionState = React.useMemo(
    () => (controlled ? Object.fromEntries((selectedIds || []).map(id => [id, true])) : internalSelection),
    [controlled, selectedIds, internalSelection]
  );

  const allColumns = React.useMemo<ColumnDef<T, any>[]>(() => {
    if (!selectable) return columns;
    return [
      {
        id: '__select',
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
            onCheckedChange={v => table.toggleAllPageRowsSelected(!!v)}
          />
        ),
        cell: ({ row }) => <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={v => row.toggleSelected(!!v)} />
      },
      ...columns
    ];
  }, [columns, selectable]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: updater => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      if (controlled) onSelectedIdsChange!(Object.keys(next).filter(k => next[k]));
      else setRowSelection(next);
    },
    getRowId,
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } }
  });

  React.useEffect(() => {
    onSelectionChange?.(table.getSelectedRowModel().rows.map(r => r.original));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection]);

  // Clear (uncontrolled) selection when the data set changes (e.g. after a bulk action)
  React.useEffect(() => {
    if (!controlled) setRowSelection({});
  }, [data]);

  const rows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {(!hideSearch || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!hideSearch && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search table" placeholder={searchPlaceholder} value={globalFilter} onChange={e => setGlobalFilter(e.target.value)} className="pl-9" />
            </div>
          )}
          {toolbar}
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map(header => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button type="button" onClick={header.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : sorted === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={allColumns.length} className="py-10 text-center text-muted-foreground">{emptyMessage}</TableCell>
              </TableRow>
            ) : (
              rows.map(row => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined} className={rowClassName?.(row.original)}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {filteredCount} result{filteredCount === 1 ? '' : 's'} · page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft /> Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

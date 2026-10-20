import * as React from "react"

import { cn } from "@/lib/utils/index"

const TEXT_SIZE = /^text-(xs|sm|base|lg|xl|\d|\[)/
const PADDING_X = /^(p|px|pl|pr)-/
const PADDING_Y = /^(p|py|pt|pb)-/

/**
 * Smaller sizes for phones (below md), on top of the unchanged desktop classes.
 * A size is left out when the page sets that property itself, so the page's own
 * padding, height or text size still applies at every width.
 */
function phoneSizes(className: string | undefined, sizes: Array<[string, RegExp]>) {
  const own = (className ?? "").split(/\s+/).filter((token) => token && !token.includes(":"))
  return sizes.filter(([, setByPage]) => !own.some((token) => setByPage.test(token))).map(([classes]) => classes)
}

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-x-auto overscroll-x-contain">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", phoneSizes(className, [["max-md:text-xs", TEXT_SIZE]]), className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-violet-500/10 [&_tr]:border-b [&_tr]:hover:bg-transparent", className)}
    {...props}
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0 [&>tr:nth-child(even)]:bg-muted/40", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:!bg-primary/5 data-[state=selected]:bg-primary/10",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

/** `sticky` pins the cell to the left edge on phones, where wide tables scroll sideways. */
type StickyCellProps = { sticky?: boolean }

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & StickyCellProps
>(({ className, sticky, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-foreground/70 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      phoneSizes(className, [
        ["max-md:h-8", /^h-/],
        ["max-md:px-2", PADDING_X],
        ["max-md:text-[11px]", TEXT_SIZE],
      ]),
      sticky && "table-sticky-col",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & StickyCellProps
>(({ className, sticky, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-3 py-2.5 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      phoneSizes(className, [
        ["max-md:px-2", PADDING_X],
        ["max-md:py-1.5", PADDING_Y],
      ]),
      sticky && "table-sticky-col",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", phoneSizes(className, [["max-md:text-xs", TEXT_SIZE]]), className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}

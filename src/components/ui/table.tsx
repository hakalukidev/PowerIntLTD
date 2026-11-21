"use client"

import * as React from "react"
import { ZoomIn, ZoomOut } from "lucide-react"

import { cn } from "@/lib/utils/index"

const ZOOM_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5]
const ZOOM_STORAGE_KEY = "table-zoom"
const ZOOM_EVENT = "table-zoom-change"

/** The phone table zoom level, shared by every table and remembered on the device. */
function useTableZoom() {
  const [zoom, setZoom] = React.useState(1)

  React.useEffect(() => {
    const read = () => {
      try {
        const saved = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY))
        setZoom(ZOOM_STEPS.includes(saved) ? saved : 1)
      } catch {
        setZoom(1)
      }
    }
    read()
    window.addEventListener(ZOOM_EVENT, read)
    return () => window.removeEventListener(ZOOM_EVENT, read)
  }, [])

  const change = React.useCallback((next: number) => {
    setZoom(next)
    try {
      window.localStorage.setItem(ZOOM_STORAGE_KEY, String(next))
    } catch {
      // Private mode: the zoom still applies to this table.
    }
    window.dispatchEvent(new Event(ZOOM_EVENT))
  }, [])

  return [zoom, change] as const
}

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

/** Phones only: zoom buttons shared by every table. Also used by hand-built `<table>`s. */
function TableZoomBar({ className }: { className?: string }) {
  const [zoom, setZoom] = useTableZoom()
  const step = ZOOM_STEPS.indexOf(zoom)
  const zoomButton = "flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-foreground disabled:opacity-40"

  return (
    <div className={cn("flex items-center justify-end gap-1.5 border-b border-border/70 px-2 py-1 text-xs text-muted-foreground md:hidden print:hidden", className)}>
      <button type="button" className={zoomButton} onClick={() => setZoom(ZOOM_STEPS[step - 1])} disabled={step <= 0} aria-label="Zoom out table">
        <ZoomOut className="h-4 w-4" />
      </button>
      <button type="button" className="min-w-10 text-center tabular-nums" onClick={() => setZoom(1)} aria-label="Reset table zoom">
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className={zoomButton}
        onClick={() => setZoom(ZOOM_STEPS[step + 1])}
        disabled={step >= ZOOM_STEPS.length - 1}
        aria-label="Zoom in table"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Class and style that apply the shared phone zoom to a hand-built `<table>`. */
const tableZoomClass = "max-md:[zoom:var(--table-zoom)] print:[zoom:1]"
function useTableZoomStyle(style?: React.CSSProperties) {
  const [zoom] = useTableZoom()
  return { ...style, "--table-zoom": zoom } as React.CSSProperties
}

/** A plain `<table>` (no styling, no zoom bar) that follows the shared phone zoom. */
const ZoomTable = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, style, ...props }, ref) => (
    <table ref={ref} className={cn(tableZoomClass, className)} style={useTableZoomStyle(style)} {...props} />
  )
)
ZoomTable.displayName = "ZoomTable"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, style, ...props }, ref) => {
  const zoomStyle = useTableZoomStyle(style)

  return (
    <div className="relative w-full">
      {/* Phones only: make the table smaller to fit more columns, or bigger to read it. */}
      <TableZoomBar />
      <div className="w-full overflow-x-auto overscroll-x-contain">
        <table
          ref={ref}
          className={cn(
            "w-full caption-bottom text-sm",
            tableZoomClass,
            phoneSizes(className, [["max-md:text-xs", TEXT_SIZE]]),
            className
          )}
          style={zoomStyle}
          {...props}
        />
      </div>
    </div>
  )
})
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
  TableZoomBar,
  ZoomTable,
}

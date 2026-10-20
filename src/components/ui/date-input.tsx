"use client"

import * as React from "react"
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type ChevronProps } from "react-day-picker"

import { cn } from "@/lib/utils/index"

type DateInputProps = {
  /** `YYYY-MM-DD`, or `''` for no date. */
  value: string
  /** Called with `YYYY-MM-DD`, or `''` when cleared. */
  onChange: (value: string) => void
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  className?: string
  name?: string
  id?: string
  placeholder?: string
}

const CALENDAR_MIN_WIDTH = 288
const VIEWPORT_GUTTER = 8

const pad2 = (value: number) => String(value).padStart(2, "0")

function toIso(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function fromIso(value: string | undefined) {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined
}

function display(value: string) {
  const date = fromIso(value)
  return date ? `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}` : ""
}

/** Typed `DD/MM/YYYY` (also `-` or `.` separators, or 8 digits) to `YYYY-MM-DD`; null if it is not a real date. */
function parseTyped(text: string) {
  const trimmed = text.trim()
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(trimmed)
  if (!match) return null
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return toIso(date)
}

function rangeError(iso: string, min?: string, max?: string) {
  if (min && iso < min.slice(0, 10)) return `Pick a date on or after ${display(min)}.`
  if (max && iso > max.slice(0, 10)) return `Pick a date on or before ${display(max)}.`
  return ""
}

function CalendarChevron({ orientation, className }: ChevronProps) {
  const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown
  return <Icon className={cn("h-4 w-4", className)} />
}

/**
 * Date field shown and typed as DD/MM/YYYY, with a calendar that opens from anywhere on
 * the box. The value stays `YYYY-MM-DD`, the same as the browser's native date input it replaces.
 */
export function DateInput({ value, onChange, min, max, required, disabled, className, name, id, placeholder = "DD/MM/YYYY" }: DateInputProps) {
  const [text, setText] = React.useState(() => display(value))
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState<Date>(() => fromIso(value) ?? new Date())
  const [focusCalendar, setFocusCalendar] = React.useState(false)
  const [touch, setTouch] = React.useState(false)
  // `undefined` portals to <body>; floating-ui reads `null` as "root not ready" and renders nothing.
  const [portalRoot, setPortalRoot] = React.useState<HTMLElement | undefined>(undefined)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Follow changes made outside the box (a "Clear filters" button, a form reset), but leave half-typed text alone.
  React.useEffect(() => {
    setText((current) => ((parseTyped(current) ?? (current.trim() ? null : "")) === value ? current : display(value)))
  }, [value])

  React.useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches)
  }, [])

  const typedIso = parseTyped(text)
  const error = !text.trim() ? "" : typedIso === null ? "Enter a date as DD/MM/YYYY." : rangeError(typedIso, min, max)

  React.useEffect(() => {
    inputRef.current?.setCustomValidity(error)
  }, [error])

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => {
      setOpen(next)
      if (!next) setFocusCalendar(false)
    },
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      size({
        padding: VIEWPORT_GUTTER,
        apply({ rects, elements }) {
          const width = Math.min(Math.max(rects.reference.width, CALENDAR_MIN_WIDTH), window.innerWidth - VIEWPORT_GUTTER * 2)
          elements.floating.style.width = `${width}px`
        },
      }),
      flip({ padding: VIEWPORT_GUTTER, fallbackStrategy: "initialPlacement" }),
      // On a short screen where neither side fits, slide up over the box rather than run off the bottom.
      shift({ padding: VIEWPORT_GUTTER, crossAxis: true }),
    ],
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([useDismiss(context, { escapeKey: false })])

  // Escape closes only the calendar. Caught on window first, so a surrounding dialog does not close too.
  React.useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.stopPropagation()
      event.preventDefault()
      setOpen(false)
      setFocusCalendar(false)
      inputRef.current?.focus()
    }
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [open])

  function openCalendar(withFocus = false) {
    if (disabled || open) {
      if (withFocus) setFocusCalendar(true)
      return
    }
    // Render inside an open dialog, so the dialog does not treat calendar clicks as outside clicks.
    setPortalRoot(inputRef.current?.closest<HTMLElement>('[role="dialog"]') ?? undefined)
    setMonth(fromIso(typedIso ?? value) ?? new Date())
    setFocusCalendar(withFocus)
    setOpen(true)
  }

  function commit(iso: string) {
    setText(display(iso))
    onChange(iso)
    setOpen(false)
    setFocusCalendar(false)
    inputRef.current?.focus()
  }

  function handleTextChange(next: string) {
    setText(next)
    const iso = parseTyped(next)
    if (iso && iso !== value && !rangeError(iso, min, max)) {
      onChange(iso)
      setMonth(fromIso(iso)!)
    }
  }

  function handleBlur() {
    if (!text.trim() && value) onChange("")
    else if (typedIso && !error) setText(display(typedIso))
  }

  const minDate = fromIso(min)
  const maxDate = fromIso(max)
  const today = toIso(new Date())
  const todayAllowed = !rangeError(today, min, max)
  const thisYear = new Date().getFullYear()

  return (
    <div
      ref={refs.setReference}
      {...getReferenceProps()}
      className={cn("relative w-full", className)}
    >
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode={touch ? "none" : "numeric"}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onChange={(event) => handleTextChange(event.target.value)}
        onClick={() => openCalendar()}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault()
            openCalendar(true)
          } else if (event.key === "Tab") {
            setOpen(false)
          }
        }}
        className={cn(
          "flex h-full min-h-9 w-full cursor-pointer rounded-md border border-input bg-transparent py-1 pl-3 pr-8 text-base tabular-nums shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:cursor-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          error && "border-rose-500 focus-visible:ring-rose-500"
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Close calendar" : "Open calendar"}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      {name ? <input type="hidden" name={name} value={typedIso ?? value} /> : null}

      {open ? (
        <FloatingPortal root={portalRoot}>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              role="dialog"
              aria-label="Choose date"
              data-date-input-calendar=""
              className="z-50 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
            >
              <DayPicker
                mode="single"
                selected={fromIso(typedIso ?? value)}
                onSelect={(date) => date && commit(toIso(date))}
                month={month}
                onMonthChange={setMonth}
                disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
                startMonth={minDate ?? new Date(thisYear - 90, 0)}
                endMonth={maxDate ?? new Date(thisYear + 10, 11)}
                captionLayout="dropdown"
                weekStartsOn={0}
                showOutsideDays
                fixedWeeks
                autoFocus={focusCalendar}
                components={{ Chevron: CalendarChevron }}
                classNames={{
                  root: "w-full",
                  months: "relative w-full",
                  month: "w-full space-y-2",
                  month_caption: "flex h-8 items-center",
                  dropdowns: "flex items-center gap-1.5",
                  dropdown_root:
                    "relative inline-flex items-center rounded-md border border-input px-2 py-1 has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring",
                  dropdown: "absolute inset-0 w-full cursor-pointer appearance-none bg-popover text-popover-foreground opacity-0",
                  caption_label: "inline-flex items-center gap-1 text-sm font-medium",
                  nav: "absolute right-0 top-0 z-10 flex items-center gap-1",
                  button_previous:
                    "inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40",
                  button_next:
                    "inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40",
                  month_grid: "w-full border-collapse",
                  weekday: "pb-1 text-center text-xs font-normal text-muted-foreground",
                  day: "p-0.5 text-center",
                  day_button:
                    "mx-auto flex h-9 w-full max-w-11 items-center justify-center rounded-md text-sm tabular-nums hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
                  selected:
                    "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
                  today: "font-semibold [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-primary/60",
                  outside: "text-muted-foreground/50",
                  disabled: "text-muted-foreground/30",
                  hidden: "invisible",
                }}
              />
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => commit("")}
                  className="rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={!todayAllowed}
                  onClick={() => commit(today)}
                  className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
                >
                  Today
                </button>
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </div>
  )
}

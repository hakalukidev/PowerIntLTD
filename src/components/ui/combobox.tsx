"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react"

import { cn } from "@/lib/utils/index"

export type ComboboxOption = {
  value: string
  label: string
  sublabel?: string
}

type ComboboxProps = {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  onCreateNew?: (typedText: string) => void
  createNewLabel?: string
  disabled?: boolean
  className?: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  onCreateNew,
  createNewLabel = "Create new",
  disabled,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const selected = options.find((option) => option.value === value)

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return options
    }
    return options.filter((option) =>
      [option.label, option.sublabel].filter(Boolean).join(" ").toLowerCase().includes(query)
    )
  }, [options, search])

  React.useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        setSearch("")
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  React.useEffect(() => {
    if (open) {
      searchInputRef.current?.focus()
    }
  }, [open])

  function handleSelect(nextValue: string) {
    onChange(nextValue)
    setOpen(false)
    setSearch("")
  }

  function handleCreateNew() {
    onCreateNew?.(search.trim())
    setOpen(false)
    setSearch("")
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm font-normal shadow-sm disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto overflow-x-hidden p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              filtered.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.sublabel ? (
                      <span className="truncate text-xs text-muted-foreground">{option.sublabel}</span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
            {onCreateNew ? (
              <div className="border-t p-1">
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm text-primary outline-none hover:bg-accent"
                >
                  <Plus className="mr-2 h-4 w-4 shrink-0" />
                  {search.trim() ? `${createNewLabel} "${search.trim()}"` : createNewLabel}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

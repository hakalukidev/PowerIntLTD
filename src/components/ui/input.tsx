import * as React from "react"

import { cn } from "@/lib/utils/index"
import { sanitizeNumberInput, stepAllowsDecimal } from "@/lib/utils/number-input"

const inputClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    if (type === "number") return <NumberInput className={className} ref={ref} {...props} />
    return (
      <input
        type={type}
        className={cn(inputClassName, className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

/**
 * type="number" is rendered as a text box with a number keyboard: no spinner arrows, the mouse
 * wheel cannot change it, leading zeros are stripped as you type and focusing selects the value
 * so typing replaces it. min/max are still checked when the form is submitted.
 */
const NumberInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "type">>(
  ({ className, min, max, step, inputMode, onChange, onFocus, onMouseDown, onMouseUp, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null)
    const focusedByClick = React.useRef(false)
    const decimal = stepAllowsDecimal(step)
    const negative = min === undefined || min === "" || Number(min) < 0

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      },
      [ref]
    )

    // A text box has no built-in min/max checks, so report them the way a number box would.
    React.useEffect(() => {
      const node = innerRef.current
      if (!node) return
      const text = node.value
      let message = ""
      if (text !== "") {
        const value = Number(text)
        if (!Number.isFinite(value)) message = "Please enter a number."
        else if (min !== undefined && min !== "" && value < Number(min)) message = `Value must be greater than or equal to ${min}.`
        else if (max !== undefined && max !== "" && value > Number(max)) message = `Value must be less than or equal to ${max}.`
      }
      node.setCustomValidity(message)
    })

    return (
      <input
        type="text"
        inputMode={inputMode ?? (decimal ? "decimal" : "numeric")}
        autoComplete="off"
        data-number-input=""
        className={cn(inputClassName, className)}
        ref={setRefs}
        onChange={(event) => {
          const node = event.target
          const raw = node.value
          const clean = sanitizeNumberInput(raw, { decimal, negative })
          if (clean !== raw) {
            const caret = node.selectionStart ?? raw.length
            const nextCaret = Math.min(sanitizeNumberInput(raw.slice(0, caret), { decimal, negative }).length, clean.length)
            node.value = clean
            node.setSelectionRange(nextCaret, nextCaret)
          }
          onChange?.(event)
        }}
        onFocus={(event) => {
          event.target.select()
          onFocus?.(event)
        }}
        onMouseDown={(event) => {
          focusedByClick.current = document.activeElement !== event.currentTarget
          onMouseDown?.(event)
        }}
        onMouseUp={(event) => {
          // The click that focused the box would otherwise drop the selection again.
          if (focusedByClick.current) {
            focusedByClick.current = false
            event.preventDefault()
          }
          onMouseUp?.(event)
        }}
        {...props}
      />
    )
  }
)
NumberInput.displayName = "NumberInput"

export { Input }

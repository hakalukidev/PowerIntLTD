"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from "react"

import { cn } from "@/lib/utils"

export type SignaturePadHandle = {
  clear: () => void
  isEmpty: () => boolean
  toDataUrl: () => string
}

type SignaturePadProps = {
  className?: string
  height?: number
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { className, height = 180 },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const hasDrawnRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext("2d")
    if (!context) return

    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    context.scale(ratio, ratio)
    context.lineWidth = 2
    context.lineCap = "round"
    context.lineJoin = "round"
    context.strokeStyle = "#111827"
  }, [])

  function getPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault()
    canvasRef.current?.setPointerCapture(event.pointerId)
    drawingRef.current = true
    lastPointRef.current = getPoint(event)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return

    const context = canvasRef.current?.getContext("2d")
    const last = lastPointRef.current
    const point = getPoint(event)

    if (context && last) {
      context.beginPath()
      context.moveTo(last.x, last.y)
      context.lineTo(point.x, point.y)
      context.stroke()
      hasDrawnRef.current = true
    }

    lastPointRef.current = point
  }

  function stopDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false
    lastPointRef.current = null
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId)
    }
  }

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current
      const context = canvas?.getContext("2d")
      if (canvas && context) {
        context.clearRect(0, 0, canvas.width, canvas.height)
      }
      hasDrawnRef.current = false
    },
    isEmpty() {
      return !hasDrawnRef.current
    },
    toDataUrl() {
      return canvasRef.current?.toDataURL("image/png") ?? ""
    },
  }))

  return (
    <canvas
      ref={canvasRef}
      className={cn("w-full cursor-crosshair rounded-xl border border-dashed border-border bg-white", className)}
      style={{ height, touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrawing}
      onPointerLeave={stopDrawing}
      onPointerCancel={stopDrawing}
    />
  )
})

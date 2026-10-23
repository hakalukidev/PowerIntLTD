"use client"

import { useState } from 'react'

import type { getProductStatus } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type ProductStatus = ReturnType<typeof getProductStatus>

export function statusBadgeClass(status: ProductStatus) {
  if (status === 'active') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300'
  }

  if (status === 'low-stock') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:text-amber-300'
  }

  return 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-500/30 dark:text-rose-300'
}

export function statusLabel(status: ProductStatus) {
  return status.replace('-', ' ')
}

/** "1 unit", "76 units". */
export function unitsLabel(quantity: number) {
  return `${quantity} ${Math.abs(quantity) === 1 ? 'unit' : 'units'}`
}

/**
 * The product's image, or the "No image" placeholder when it has none or the image fails to load
 * (a deleted upload, or the image host refusing the request). `className` sets size, rounding and text size.
 */
export function ProductImage({ src, alt, className }: { src?: string; alt: string; className: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) {
    return (
      <div
        data-product-image="none"
        className={cn('flex shrink-0 items-center justify-center border border-dashed border-border/70 bg-muted/30 text-center font-medium uppercase tracking-[0.2em] text-muted-foreground', className)}
      >
        No image
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote upload URLs, not optimised by next/image
    <img src={src} alt={alt} data-product-image="loaded" onError={() => setFailedSrc(src)} className={cn('shrink-0 border border-border/70 object-cover', className)} />
  )
}

"use client"

import { useEffect, useMemo, useState } from 'react'
import { Package, Search } from 'lucide-react'

import { usePortal } from '@/components/portal/PortalShell'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PortalProduct } from '@/lib/erp/portal'
import { useERP } from '@/lib/erp/provider'
import { formatCurrency } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

export default function PortalProductsPage() {
  const { authorizedFetch } = useERP()
  const { overview } = usePortal()
  const [products, setProducts] = useState<PortalProduct[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  useEffect(() => {
    let cancelled = false
    authorizedFetch<{ products: PortalProduct[] }>('/api/portal/products')
      .then((result) => {
        if (!cancelled) setProducts(result.products)
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load products.')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categories = useMemo(
    () => Array.from(new Set((products ?? []).map((product) => product.category).filter(Boolean))).sort(),
    [products]
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (products ?? []).filter(
      (product) =>
        (category === 'all' || product.category === category) &&
        (!needle || [product.name, product.brand, product.category].join(' ').toLowerCase().includes(needle))
    )
  }, [category, products, query])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Products</h1>
        <p className="text-sm text-muted-foreground">
          {overview?.account.partyKind === 'customer' ? 'Our product range with your price.' : 'The product range we carry.'}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
      {!products && !error ? <p className="py-10 text-center text-sm text-muted-foreground">Loading products...</p> : null}
      {products && visible.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No products match.</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((product) => (
          <div key={product.id} className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
            <div className="flex aspect-square items-center justify-center bg-muted/40">
              {product.imageUrl ? (
                // Product images come from Cloudinary at whatever size they were uploaded.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <Package className="h-10 w-10 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {[product.brand, product.category].filter(Boolean).join(' · ') || 'Product'}
              </p>
              <p className="line-clamp-2 text-sm font-semibold">{product.name}</p>
              {product.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{product.description}</p> : null}
              <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                {product.price !== null ? (
                  <span className="text-sm font-semibold tabular-nums text-primary">{formatCurrency(product.price, overview?.company.currency)}</span>
                ) : (
                  <span />
                )}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    product.inStock ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  )}
                >
                  {product.inStock ? 'In stock' : 'Out of stock'}
                </span>
              </div>
              {product.warrantyMonths ? <p className="text-[11px] text-muted-foreground">{product.warrantyMonths} months warranty</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

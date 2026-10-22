"use client"

import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { WarehouseRecord } from '@/lib/erp/types'
import { cn } from '@/lib/utils'

export type AllocationRow = { key: string; warehouseId: string; quantity: string }

export function newAllocationRow(warehouseId = '', quantity = ''): AllocationRow {
  return { key: Math.random().toString(36).slice(2), warehouseId, quantity }
}

/** The rows as `{ warehouseId, quantity }`, empty rows left out. */
export function allocationLines(rows: AllocationRow[]) {
  return rows
    .filter((row) => row.warehouseId || row.quantity.trim())
    .map((row) => ({ warehouseId: row.warehouseId, quantity: Number(row.quantity.replaceAll(',', '').trim() || 0) }))
}

export function allocatedTotal(rows: AllocationRow[]) {
  return allocationLines(rows).reduce((sum, line) => sum + (Number.isFinite(line.quantity) ? line.quantity : 0), 0)
}

/**
 * Warehouse | Qty rows with "+" to split a quantity over several warehouses. With `total`, shows
 * how much of it is allocated so far; the rows must add up to it before the form can be saved.
 */
export function WarehouseAllocationRows({
  warehouses,
  rows,
  onChange,
  total,
  label = 'Warehouses',
}: {
  warehouses: WarehouseRecord[]
  rows: AllocationRow[]
  onChange: (rows: AllocationRow[]) => void
  total?: number
  label?: string
}) {
  const allocated = allocatedTotal(rows)
  const setRow = (key: string, change: Partial<AllocationRow>) => onChange(rows.map((row) => (row.key === key ? { ...row, ...change } : row)))
  const used = new Set(rows.map((row) => row.warehouseId))
  const canAdd = rows.length < warehouses.length

  return (
    <div className="space-y-2" data-allocation-rows>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {total !== undefined ? (
          <p
            data-allocation-status={allocated === total ? 'complete' : 'incomplete'}
            className={cn('text-xs tabular-nums', allocated === total ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}
          >
            Allocated {allocated} of {total}
          </p>
        ) : null}
      </div>
      {rows.map((row, index) => (
        <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2" data-allocation-row={index}>
          <Select value={row.warehouseId} onValueChange={(value) => setRow(row.key, { warehouseId: value })}>
            <SelectTrigger aria-label={`Warehouse ${index + 1}`} className="min-w-0">
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id} disabled={warehouse.id !== row.warehouseId && used.has(warehouse.id)}>
                  {warehouse.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            aria-label={`Quantity ${index + 1}`}
            value={row.quantity}
            onChange={(event) => setRow(row.key, { quantity: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove warehouse ${index + 1}`}
            disabled={rows.length === 1}
            onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={!canAdd}
        onClick={() => {
          const remaining = total !== undefined && total > allocated ? String(total - allocated) : ''
          onChange([...rows, newAllocationRow(warehouses.find((warehouse) => !used.has(warehouse.id))?.id ?? '', remaining)])
        }}
      >
        <Plus className="h-4 w-4" />
        Split to another warehouse
      </Button>
    </div>
  )
}

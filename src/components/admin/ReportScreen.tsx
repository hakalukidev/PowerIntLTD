"use client"

import { useEffect, useMemo, useState } from 'react'
import { FileDown, FileSpreadsheet, ListFilter, Printer, RotateCcw } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { formatReportValue, reportExportValue, REPORT_SOURCES } from '@/lib/erp/reportSources'
import { buildUserReport, exportPdf, exportXlsx, formatDate, toArray } from '@/lib/erp/utils'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const ALL_FILTER_VALUE = '__all__'

export function ReportScreen() {
  const { data, currentUser, currentPermissions } = useERP()
  const currency = data?.settings.currency

  const [sourceId, setSourceId] = useState(REPORT_SOURCES[0].id)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())

  const source = useMemo(
    () => REPORT_SOURCES.find((entry) => entry.id === sourceId) ?? REPORT_SOURCES[0],
    [sourceId]
  )

  useEffect(() => {
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setFilterValues({})
    setHiddenColumns(new Set())
  }, [sourceId])

  const rawRows = useMemo(() => (data ? source.rows(data) : []), [data, source])
  const primaryDateColumn = useMemo(() => source.columns.find((column) => column.isPrimaryDate), [source])
  const filterableColumns = useMemo(() => source.columns.filter((column) => column.filterable), [source])
  const searchableColumns = useMemo(() => source.columns.filter((column) => column.searchable), [source])

  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {}
    filterableColumns.forEach((column) => {
      const values = new Set<string>()
      rawRows.forEach((row) => {
        const value = row[column.key]
        if (value === null || value === undefined || value === '') return
        values.add(column.type === 'boolean' ? (value ? 'Yes' : 'No') : String(value))
      })
      options[column.key] = Array.from(values).sort((a, b) => a.localeCompare(b))
    })
    return options
  }, [filterableColumns, rawRows])

  const filteredRows = useMemo(() => {
    return rawRows.filter((row) => {
      if (primaryDateColumn) {
        const rawValue = row[primaryDateColumn.key]
        const value = rawValue ? String(rawValue).slice(0, 10) : ''
        if (dateFrom && (!value || value < dateFrom)) return false
        if (dateTo && (!value || value > dateTo)) return false
      }

      for (const column of filterableColumns) {
        const selected = filterValues[column.key]
        if (!selected || selected === ALL_FILTER_VALUE) continue
        const value = row[column.key]
        const normalized = column.type === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '')
        if (normalized !== selected) return false
      }

      if (search.trim()) {
        const needle = search.trim().toLowerCase()
        const matches = searchableColumns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(needle))
        if (!matches) return false
      }

      return true
    })
  }, [rawRows, primaryDateColumn, dateFrom, dateTo, filterableColumns, filterValues, search, searchableColumns])

  const visibleColumns = useMemo(
    () => source.columns.filter((column) => !hiddenColumns.has(column.key)),
    [source, hiddenColumns]
  )

  const summaryColumns = useMemo(
    () => visibleColumns.filter((column) => column.type === 'currency' || column.type === 'number').slice(0, 4),
    [visibleColumns]
  )

  const summaries = useMemo(
    () =>
      summaryColumns.map((column) => ({
        column,
        total: filteredRows.reduce((sum, row) => sum + (Number(row[column.key]) || 0), 0),
      })),
    [summaryColumns, filteredRows]
  )

  function toggleColumn(key: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function resetFilters() {
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setFilterValues({})
  }

  const reportTitle = `${source.label} Report${dateFrom || dateTo ? ` (${dateFrom ? formatDate(dateFrom) : 'Start'} - ${dateTo ? formatDate(dateTo) : 'Now'})` : ''}`

  function exportDynamicXlsx() {
    void exportXlsx(
      `${source.id}-report.xlsx`,
      source.label.slice(0, 30),
      visibleColumns.map((column) => column.label),
      filteredRows.map((row) => visibleColumns.map((column) => reportExportValue(column, row[column.key])))
    )
  }

  function exportDynamicPdf() {
    void exportPdf(
      `${source.id}-report.pdf`,
      reportTitle,
      visibleColumns.map((column) => column.label),
      filteredRows.map((row) => visibleColumns.map((column) => formatReportValue(column, row[column.key], currency ?? 'BDT')))
    )
  }

  function printDynamicReport() {
    const rows = filteredRows
      .map(
        (row) => `
          <tr>
            ${visibleColumns
              .map((column) => {
                const value = formatReportValue(column, row[column.key], currency ?? 'BDT')
                const numeric = column.type === 'currency' || column.type === 'number'
                return `<td class="${numeric ? 'numeric' : ''}">${escapeHtml(value)}</td>`
              })
              .join('')}
          </tr>
        `
      )
      .join('')

    const popup = window.open('', '_blank', 'width=1120,height=760')
    if (!popup) return

    popup.document.open()
    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(reportTitle)}</title>
          <style>
            * { box-sizing: border-box; }
            body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 24px; }
            h1 { font-size: 22px; margin: 0; }
            p { color: #4b5563; font-size: 12px; margin: 6px 0 0; }
            table { border-collapse: collapse; width: 100%; margin-top: 16px; }
            th { background: #f3f4f6; color: #374151; font-size: 11px; text-align: left; text-transform: uppercase; }
            th, td { border: 1px solid #d1d5db; padding: 8px; }
            td { font-size: 12px; vertical-align: top; }
            .numeric { text-align: right; }
            @media print { body { padding: 12px; } }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(reportTitle)}</h1>
          <p>${escapeHtml(data?.settings.companyName ?? 'ERP')} | Generated ${formatDate(new Date().toISOString())} | ${filteredRows.length} entries</p>
          <table>
            <thead>
              <tr>${visibleColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="${visibleColumns.length}">No data found.</td></tr>`}</tbody>
          </table>
          <script>
            window.addEventListener('load', () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>
    `)
    popup.document.close()
  }

  // Quick full-module exports (all rows, fixed columns, no filters needed)
  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])
  const userReport = buildUserReport(data)

  function exportAllXlsx() {
    void exportXlsx(
      'ims-all-operational-report.xlsx',
      'All Operations',
      ['Section', 'SN', 'Name / Bill', 'Contact', 'Value', 'Status'],
      [
        ...toArray(data?.orders).map((order, index) => [
          'Sales',
          String(index + 1),
          `${order.billNumber} - ${order.customerName}`,
          order.customerName,
          String(order.total),
          order.status,
        ]),
        ...customers.map((customer, index) => [
          'Customers',
          String(index + 1),
          customer.name,
          customer.phone,
          String(customer.due),
          customer.supportStatus,
        ]),
        ...products.map((product, index) => [
          'Stock',
          String(index + 1),
          product.name,
          product.sku,
          String(product.stockQty),
          product.status,
        ]),
        ...suppliers.map((supplier, index) => [
          'Suppliers',
          String(index + 1),
          supplier.name,
          supplier.phone,
          String(supplier.productCost + supplier.shippingCost + supplier.customsDuty + supplier.otherCost),
          supplier.lcStatus,
        ]),
      ]
    )
  }

  function exportUserXlsx() {
    void exportXlsx(
      'ims-user-performance-report.xlsx',
      'User Performance',
      ['User', 'Role', 'Orders', 'Pending Orders', 'Completed Orders', 'Revenue', 'Due'],
      userReport.map((row) => [row.name, row.role, row.totalOrders, row.pendingOrders, row.completedOrders, row.revenue, row.due])
    )
  }

  return (
    <AdminShell active="Reports">
      <div className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">Reports</Badge>
                <Badge variant="outline" className="rounded-full">Excel + PDF + Print</Badge>
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">Dynamic report builder</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Pick any data source, filter it, choose the columns you need, then export or print the result.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="rounded-xl" onClick={exportAllXlsx}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export all Excel
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={exportUserXlsx}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                User performance Excel
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Report source & filters</CardTitle>
            <CardDescription>Choose what to report on, narrow it down, then export in the format you need.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Report type</p>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_SOURCES.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>{entry.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {primaryDateColumn ? (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">From ({primaryDateColumn.label})</p>
                    <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">To ({primaryDateColumn.label})</p>
                    <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                <p className="text-sm font-medium">Search</p>
                <Input placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>

            {filterableColumns.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {filterableColumns.map((column) => (
                  <div key={column.key} className="space-y-2">
                    <p className="text-sm font-medium">{column.label}</p>
                    <Select
                      value={filterValues[column.key] ?? ALL_FILTER_VALUE}
                      onValueChange={(value) => setFilterValues((prev) => ({ ...prev, [column.key]: value }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTER_VALUE}>All {column.label}</SelectItem>
                        {(filterOptions[column.key] ?? []).map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="rounded-xl">
                    <ListFilter className="mr-2 h-4 w-4" />
                    Columns ({visibleColumns.length}/{source.columns.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80">
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {source.columns.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.key}
                      checked={!hiddenColumns.has(column.key)}
                      onCheckedChange={() => toggleColumn(column.key)}
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" className="rounded-xl" onClick={resetFilters}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset filters
              </Button>
              <div className="ml-auto flex flex-wrap gap-3">
                <Button variant="outline" className="rounded-xl" onClick={exportDynamicXlsx}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Excel
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={exportDynamicPdf}>
                  <FileDown className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button className="rounded-xl" onClick={printDynamicReport}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {summaries.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaries.map(({ column, total }) => (
              <Card key={column.key} className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Total {column.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {formatReportValue(column, total, currency ?? 'BDT')}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>{source.label}</CardTitle>
              <CardDescription>{source.description}</CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full">{filteredRows.length} entries</Badge>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    {visibleColumns.map((column) => (
                      <TableHead key={column.key}>{column.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row, index) => (
                    <TableRow key={index}>
                      {visibleColumns.map((column) => (
                        <TableCell key={column.key} className={column.key === 'products' ? 'min-w-56' : undefined}>
                          {formatReportValue(column, row[column.key], currency ?? 'BDT') || 'N/A'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumns.length || 1} className="h-28 text-center text-muted-foreground">
                        No data found for this filter.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

    
      </div>
    </AdminShell>
  )
}

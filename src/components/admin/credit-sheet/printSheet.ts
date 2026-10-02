import { escapeHtml } from '@/lib/erp/utils'

type BrandedDocumentOptions = {
  title: string
  heading: string
  /** Small highlighted tag beside the heading, like the "INDEX" label on the paper ledger. */
  badge?: string
  body: string
  /** Opens the print dialog once loaded. Off when the page is rendered to a PDF file instead. */
  autoPrint?: boolean
}

/**
 * Builds the printable page used for the credit sheet and dealer ledgers, laid
 * out like the company's paper ledger: the logo and company name centred, then
 * the sheet heading.
 */
export function brandedDocument({ title, heading, badge, body, autoPrint = true }: BrandedDocumentOptions) {
  const logoUrl = `${window.location.origin}/power-icon.png`
  const generatedAt = new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 0; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #111827; font-family: Arial, 'Noto Sans Bengali', sans-serif; margin: 0; padding: 12mm 12mm 16mm; }
          .brand { align-items: center; display: flex; gap: 18px; justify-content: center; }
          .brand img { height: 58px; width: 58px; object-fit: contain; }
          .brand h1 { font-family: 'Times New Roman', Georgia, serif; font-size: 30px; font-weight: 400; letter-spacing: .02em; margin: 0; }
          .heading-row { align-items: center; display: grid; grid-template-columns: 1fr auto 1fr; margin: 6px 0 14px; }
          .heading { border-bottom: 1px solid #111827; font-size: 14px; font-weight: 700; letter-spacing: .08em; padding: 0 60px 3px; text-align: center; text-transform: uppercase; }
          .badge { background: #00e5ff; font-size: 12px; font-weight: 700; justify-self: end; padding: 2px 26px; text-transform: uppercase; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #111827; font-size: 11px; padding: 4px 7px; }
          th { background: #1e293b; color: #fff; font-weight: 700; text-align: left; }
          table.info { margin-bottom: 14px; }
          table.info td.label { font-weight: 700; white-space: nowrap; width: 1%; }
          table.info td.center { text-align: center; }
          .numeric { text-align: right; white-space: nowrap; }
          .group-title { font-size: 12px; font-weight: 700; margin: 14px 0 4px; text-transform: uppercase; }
          tr.subtotal td { background: #e2e8f0; font-weight: 700; }
          tr.grand td { background: #cbd5e1; font-weight: 700; }
          .section-title { font-size: 12px; font-weight: 700; letter-spacing: .06em; margin: 18px 0 6px; text-transform: uppercase; }
          .notes { display: grid; gap: 8px; }
          .note { border: 1px solid #9ca3af; display: flex; font-size: 11px; gap: 10px; padding: 6px 8px; page-break-inside: avoid; }
          .note img { height: 70px; object-fit: cover; width: 70px; }
          .note .meta { color: #4b5563; font-size: 10px; margin-top: 3px; }
          .print-date { color: #6b7280; font-size: 10px; margin-top: 16px; text-align: right; }
        </style>
      </head>
      <body>
        <div class="brand">
          <img src="${logoUrl}" alt="" />
          <h1>POWER INTERNATIONAL BD</h1>
        </div>
        <div class="heading-row">
          <span></span>
          <span class="heading">${escapeHtml(heading)}</span>
          ${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : '<span></span>'}
        </div>
        ${body}
        <p class="print-date">Printed ${escapeHtml(generatedAt)}</p>
        ${
          autoPrint
            ? `<script>
          window.addEventListener('load', () => {
            window.focus();
            window.print();
          });
        </script>`
            : ''
        }
      </body>
    </html>
  `
}

/** Opens the document in a new window and triggers print. Returns false when popups are blocked. */
export function openPrintWindow(html: string) {
  const popup = window.open('', '_blank', 'width=1000,height=760')
  if (!popup) return false

  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  return true
}

// A4 at 96 DPI, the size the printable page is laid out for.
const A4_WIDTH_PX = 794
const A4_HEIGHT_PX = 1123
// Matches the 12mm top and 16mm bottom padding of the printed page.
const PAGE_TOP_PX = 45
const PAGE_BOTTOM_PX = 60

// Bangla font for the hidden text layer. It has no Latin letters, so English words use Helvetica.
const BANGLA_FONT_URL = '/fonts/NotoSansBengali-Regular.ttf'
const BANGLA_FONT = 'NotoSansBengali'

type TextRun = { text: string; left: number; top: number; width: number; height: number; fontPx: number; latin: boolean }

/** Every word on the rendered page with its position, split where it switches between Latin-1 and other scripts. */
function collectTextRuns(frameDocument: Document) {
  const runs: TextRun[] = []
  const walker = frameDocument.createTreeWalker(frameDocument.body, NodeFilter.SHOW_TEXT)
  const range = frameDocument.createRange()

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement
    const value = node.nodeValue ?? ''
    if (!parent || parent.closest('script, style') || !value.trim()) continue
    const fontPx = parseFloat(frameDocument.defaultView?.getComputedStyle(parent).fontSize ?? '') || 11

    for (const word of value.matchAll(/\S+/g)) {
      for (const piece of word[0].matchAll(/[\x00-\xff]+|[^\x00-\xff]+/g)) {
        const start = (word.index ?? 0) + (piece.index ?? 0)
        range.setStart(node, start)
        range.setEnd(node, start + piece[0].length)
        const rect = range.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        runs.push({
          text: piece[0],
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          fontPx,
          latin: isLatin1(piece[0]),
        })
      }
    }
  }

  return runs
}

async function loadBanglaFont() {
  try {
    const response = await fetch(BANGLA_FONT_URL)
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    }
    return btoa(binary)
  } catch {
    return null
  }
}

/** Saves a document as one tall A4-wide JPG, rendered off-screen so the page layout is not disturbed. */
export async function downloadDocumentJpg(html: string, filename: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;height:${A4_HEIGHT_PX}px;border:0;`
  document.body.appendChild(iframe)

  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve()
      iframe.srcdoc = html
    })

    const frameDocument = iframe.contentDocument
    if (!frameDocument) throw new Error('Unable to prepare the image.')

    await frameDocument.fonts?.ready
    await Promise.all(
      Array.from(frameDocument.images).map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.onload = () => resolve()
              image.onerror = () => resolve()
            })
      )
    )

    const { toJpeg } = await import('html-to-image')
    const body = frameDocument.body
    const dataUrl = await toJpeg(body, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      width: A4_WIDTH_PX,
      height: body.scrollHeight,
    })

    const link = document.createElement('a')
    link.href = dataUrl
    link.download = filename
    link.click()
  } finally {
    iframe.remove()
  }
}

/**
 * Saves a branded document as an A4 PDF that looks exactly like the printed
 * page: it is rendered off-screen, captured as an image, and split into pages
 * between table rows so no row is cut in half. An invisible text layer is laid
 * over each page image, like a scanned PDF, so its text (Bangla included) can
 * be searched, selected and copied.
 */
export async function downloadDocumentPdf(html: string, filename: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;height:${A4_HEIGHT_PX}px;border:0;`
  document.body.appendChild(iframe)

  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve()
      iframe.srcdoc = html
    })

    const frameDocument = iframe.contentDocument
    if (!frameDocument) throw new Error('Unable to prepare the PDF.')

    await frameDocument.fonts?.ready
    await Promise.all(
      Array.from(frameDocument.images).map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.onload = () => resolve()
              image.onerror = () => resolve()
            })
      )
    )

    const body = frameDocument.body
    const height = body.scrollHeight
    iframe.style.height = `${height}px`

    // Places where a page may end: above any table row, title, note, or section of the dealer form.
    const breaks = Array.from(
      body.querySelectorAll<HTMLElement>('tr, .group-title, .section-title, .note, .print-date, .section, .declaration, .signature-area')
    )
      .map((element) => element.getBoundingClientRect().top)
      .sort((left, right) => left - right)
    const runs = collectTextRuns(frameDocument)

    const { toCanvas } = await import('html-to-image')
    const { default: JsPDF } = await import('jspdf')
    const scale = 2
    const canvas = await toCanvas(body, {
      pixelRatio: scale,
      backgroundColor: '#ffffff',
      width: A4_WIDTH_PX,
      height,
    })

    const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const mmPerPx = 210 / A4_WIDTH_PX
    const banglaFont = runs.some((run) => !run.latin) ? await loadBanglaFont() : null
    if (banglaFont) {
      pdf.addFileToVFS(`${BANGLA_FONT}.ttf`, banglaFont)
      pdf.addFont(`${BANGLA_FONT}.ttf`, BANGLA_FONT, 'normal')
    }

    const page = document.createElement('canvas')
    page.width = A4_WIDTH_PX * scale
    page.height = A4_HEIGHT_PX * scale
    const context = page.getContext('2d')
    if (!context) throw new Error('Unable to prepare the PDF.')

    let start = 0
    let first = true
    while (start < height - 1) {
      // The first page already has its top padding in the rendered content.
      const offset = first ? 0 : PAGE_TOP_PX
      const limit = start + A4_HEIGHT_PX - offset - PAGE_BOTTOM_PX
      let end = height
      if (limit < height) {
        const fitting = breaks.filter((point) => point > start + 1 && point <= limit)
        end = fitting.length ? fitting[fitting.length - 1] : limit
      }

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, page.width, page.height)
      context.drawImage(canvas, 0, start * scale, canvas.width, (end - start) * scale, 0, offset * scale, page.width, (end - start) * scale)

      if (!first) pdf.addPage()
      pdf.addImage(page.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4_WIDTH_PX * mmPerPx, A4_HEIGHT_PX * mmPerPx)

      for (const run of runs) {
        const middle = run.top + run.height / 2
        if (middle < start || middle >= end || (!run.latin && !banglaFont)) continue
        pdf.setFont(run.latin ? 'helvetica' : BANGLA_FONT, 'normal')
        // 1px on the page is 0.75pt; stretch each word to the width it has in the image.
        pdf.setFontSize(run.fontPx * 0.75)
        const naturalWidth = pdf.getTextWidth(run.text)
        pdf.text(run.text, run.left * mmPerPx, (run.top - start + offset + (run.height - run.fontPx) / 2) * mmPerPx, {
          baseline: 'top',
          renderingMode: 'invisible',
          horizontalScale: naturalWidth ? (run.width * mmPerPx) / naturalWidth : 1,
        })
      }

      start = end
      first = false
    }

    pdf.save(filename)
  } finally {
    iframe.remove()
  }
}

export type SheetPdfCell = string | { content: string; colSpan: number }

export type SheetPdfTable = {
  title: string
  /** `group` titles sit tight above their table; `section` titles get more space, like on the printed page. */
  titleKind: 'group' | 'section'
  head: string[]
  /** Column indexes that hold amounts or counts and are right-aligned. */
  numeric: number[]
  rows: { cells: SheetPdfCell[]; tone?: 'subtotal' | 'grand' }[]
}

type SheetPdfOptions = Omit<BrandedDocumentOptions, 'body' | 'autoPrint' | 'title'> & { tables: SheetPdfTable[] }

// jsPDF's built-in fonts only cover Latin-1, and it cannot join Bangla letters correctly.
function isLatin1(value: string) {
  return !/[^\x00-\xff]/.test(value)
}

async function loadLogo() {
  try {
    const response = await fetch('/power-icon.png')
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * Saves a branded sheet as an A4 PDF with real, selectable text, drawn to match
 * the printed page. Returns false without saving when the sheet contains text
 * the PDF fonts cannot show (like Bangla), so the caller can fall back to an image PDF.
 */
export async function downloadSheetPdf({ heading, badge, tables }: SheetPdfOptions, filename: string) {
  const cellText = (cell: SheetPdfCell) => (typeof cell === 'string' ? cell : cell.content)
  // Intl can format negatives with a Unicode minus sign; the PDF fonts only have the hyphen.
  const clean = (value: string) => value.replace(/−/g, '-').replace(/ | /g, ' ')
  const texts = [heading, badge ?? '', ...tables.flatMap((table) => [table.title, ...table.head, ...table.rows.flatMap((row) => row.cells.map(cellText))])]
  if (!texts.every((text) => isLatin1(clean(text)))) return false

  const { default: JsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const logo = await loadLogo()

  // Sizes follow the printed page's CSS (1px = 0.2646mm, 1px font = 0.75pt).
  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = { top: 12, right: 12, bottom: 16, left: 12 }
  const ink: [number, number, number] = [17, 24, 39]

  // Logo and company name, centred together.
  const brandTop = margin.top
  const logoSize = 15.3
  const brandGap = 4.8
  pdf.setFont('times', 'normal')
  pdf.setFontSize(22.5)
  pdf.setCharSpace(0.16)
  const brandName = 'POWER INTERNATIONAL BD'
  const nameWidth = pdf.getTextWidth(brandName) + brandName.length * 0.16
  const brandWidth = (logo ? logoSize + brandGap : 0) + nameWidth
  let brandX = (pageWidth - brandWidth) / 2
  if (logo) {
    pdf.addImage(logo, 'PNG', brandX, brandTop, logoSize, logoSize)
    brandX += logoSize + brandGap
  }
  pdf.setTextColor(...ink)
  pdf.text(brandName, brandX, brandTop + logoSize / 2, { baseline: 'middle' })

  // Heading with its underline, and the optional badge on the right.
  const headingY = brandTop + logoSize + 5
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10.5)
  pdf.setCharSpace(0.3)
  const headingText = clean(heading).toUpperCase()
  const headingWidth = pdf.getTextWidth(headingText) + headingText.length * 0.3
  pdf.text(headingText, (pageWidth - headingWidth) / 2, headingY)
  pdf.setCharSpace(0)
  pdf.setDrawColor(...ink)
  pdf.setLineWidth(0.26)
  const underline = headingWidth + 2 * 15.9
  pdf.line((pageWidth - underline) / 2, headingY + 1.2, (pageWidth + underline) / 2, headingY + 1.2)
  if (badge) {
    pdf.setFontSize(9)
    const badgeText = clean(badge).toUpperCase()
    const badgeWidth = pdf.getTextWidth(badgeText) + 13.8
    pdf.setFillColor(0, 229, 255)
    pdf.rect(pageWidth - margin.right - badgeWidth, headingY - 3.8, badgeWidth, 5, 'F')
    pdf.text(badgeText, pageWidth - margin.right - badgeWidth / 2, headingY - 0.3, { align: 'center' })
  }

  let y = headingY + 1.2 + 3.7
  const lastTableEnd = () => (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  tables.forEach((table, tableIndex) => {
    const spaceAbove = tableIndex === 0 ? 0 : table.titleKind === 'section' ? 4.8 : 3.7
    // Keep a title on the same page as at least its header and first row.
    if (y + spaceAbove + 16 > pageHeight - margin.bottom) {
      pdf.addPage()
      y = margin.top
    } else {
      y += spaceAbove
    }

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(...ink)
    pdf.setCharSpace(table.titleKind === 'section' ? 0.2 : 0)
    pdf.text(clean(table.title).toUpperCase(), margin.left, y + 3)
    pdf.setCharSpace(0)
    y += table.titleKind === 'section' ? 5.2 : 4.3

    const numeric = new Set(table.numeric)
    autoTable(pdf, {
      startY: y,
      margin,
      theme: 'grid',
      head: [table.head.map((label, index) => ({ content: clean(label), styles: { halign: numeric.has(index) ? 'right' : 'left' } }))],
      body: table.rows.map((row) => {
        const fill: [number, number, number] | undefined =
          row.tone === 'grand' ? [203, 213, 225] : row.tone === 'subtotal' ? [226, 232, 240] : undefined
        let column = 0
        return row.cells.map((cell) => {
          const colSpan = typeof cell === 'string' ? 1 : cell.colSpan
          const halign: 'right' | 'left' = colSpan === 1 && numeric.has(column) ? 'right' : 'left'
          column += colSpan
          return {
            content: clean(cellText(cell)),
            colSpan,
            styles: { halign, ...(fill ? { fillColor: fill, fontStyle: 'bold' as const } : {}) },
          }
        })
      }),
      styles: {
        font: 'helvetica',
        fontSize: 8.25,
        textColor: ink,
        lineColor: ink,
        lineWidth: 0.26,
        cellPadding: { top: 1.05, bottom: 1.05, left: 1.85, right: 1.85 },
        valign: 'middle',
      },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: Object.fromEntries(table.numeric.map((index) => [index, { overflow: 'visible' as const, cellWidth: 'wrap' as const }])),
    })
    y = lastTableEnd()
  })

  const generatedAt = new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
  if (y + 8 > pageHeight - margin.bottom) {
    pdf.addPage()
    y = margin.top
  }
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(107, 114, 128)
  pdf.text(`Printed ${clean(generatedAt)}`, pageWidth - margin.right, y + 6.5, { align: 'right' })

  pdf.save(filename)
  return true
}

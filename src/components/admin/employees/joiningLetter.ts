import type { EmployeeRecord } from '@/lib/erp/types'
import { addMonthsToDate, formatDate, TARGET_ACHIEVEMENT_HOLD_THRESHOLD } from '@/lib/erp/utils'

type JoiningLetterContext = {
  companyName: string
  zoneName: string
  approvedByName: string
}

// jsPDF's built-in fonts only cover Latin-1, so amounts are written as "BDT 1,000" rather than with the taka sign.
const money = (value: number) => `BDT ${Math.round(value).toLocaleString('en-US')}`
// Height of one 10pt text line in mm, matching jsPDF's own spacing for multi-line text.
const LINE = 4.3

/** Builds the joining letter of an approved employee and downloads it as a PDF. */
export async function downloadJoiningLetter(employee: EmployeeRecord, context: JoiningLetterContext) {
  const { default: JsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const left = 18
  const right = pageWidth - 18
  const width = right - left
  const issuedOn = formatDate(employee.joiningLetterIssuedAt || employee.approvedAt || new Date().toISOString())
  const salaryBased = employee.compensationType === 'salary'
  const probationEnd = formatDate(addMonthsToDate(new Date(employee.joiningDate), employee.probationMonths).toISOString())

  // Letterhead
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(context.companyName, pageWidth / 2, 20, { align: 'center' })
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.6)
  doc.line(left, 25, right, 25)
  doc.setFontSize(14)
  doc.text('JOINING LETTER', pageWidth / 2, 34, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Ref: ${employee.employeeCode || '-'}`, left, 44)
  doc.text(`Date: ${issuedOn}`, right, 44, { align: 'right' })

  let y = 54
  doc.text('To,', left, y)
  doc.setFont('helvetica', 'bold')
  doc.text(employee.name, left, (y += 5))
  doc.setFont('helvetica', 'normal')
  if (employee.fatherName) doc.text(`S/O, D/O: ${employee.fatherName}`, left, (y += 5))
  if (employee.address) {
    const addressLines = doc.splitTextToSize(employee.address, width / 2)
    doc.text(addressLines, left, (y += 5))
    y += (addressLines.length - 1) * 5
  }
  if (employee.phone) doc.text(`Phone: ${employee.phone}`, left, (y += 5))

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.text(`Subject: Appointment as ${employee.designation}`, left, y)
  doc.setFont('helvetica', 'normal')

  const territory = [context.zoneName, employee.area].filter(Boolean).join(', ')
  const paragraphs = [
    `Dear ${employee.name},`,
    `We are pleased to confirm your appointment as ${employee.designation} at ${context.companyName} with effect from ${formatDate(
      employee.joiningDate
    )}${territory ? `, posted to ${territory}` : ''}. Your employee ID is ${employee.employeeCode || '-'}; please quote it in all official communication.`,
    `You are engaged on a ${salaryBased ? 'salary' : 'commission'} basis. You will be on probation for ${employee.probationMonths} month(s), until ${probationEnd}, after which your employment is confirmed. Your pay and monthly sales target are set out below.`,
  ]
  y += 8
  for (const paragraph of paragraphs) {
    const lines = doc.splitTextToSize(paragraph, width)
    doc.text(lines, left, y)
    y += lines.length * LINE + 3
  }

  const payRows: string[][] = []
  if (salaryBased) {
    payRows.push(['Basic salary (monthly)', money(employee.baseSalary)])
    payRows.push(['TA/DA (monthly)', money(employee.taDa)])
    if (employee.houseRent) payRows.push(['House rent (monthly)', money(employee.houseRent)])
    if (employee.mobileBill) payRows.push(['Mobile bill (monthly)', money(employee.mobileBill)])
  }
  if (employee.daPerDay) payRows.push(['DA per present day', money(employee.daPerDay)])
  payRows.push(['Commission per unit sold', money(employee.commissionPerUnit)])
  payRows.push(['Monthly sales target', `${employee.monthlyUnitTarget.toLocaleString('en-US')} pcs or ${money(employee.monthlyAmountTarget)}`])

  autoTable(doc, {
    startY: y,
    head: [['Pay & target', { content: 'Amount', styles: { halign: 'right' } }]],
    body: payRows,
    margin: { left, right: pageWidth - right },
    styles: { fontSize: 10, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 1: { halign: 'right' } },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  doc.setFont('helvetica', 'bold')
  doc.text('Terms', left, y)
  doc.setFont('helvetica', 'normal')
  y += 5
  const terms = [
    `Commission is paid only when you reach at least ${TARGET_ACHIEVEMENT_HOLD_THRESHOLD}% of your monthly target, and only for the share of your credit sales whose due money you have collected.`,
    'If the target is not reached, no commission is paid for that month unless the owner authorizes it on application.',
    'Any advance taken during a month is deducted from that month\'s pay. The payable amount is worked out after the month ends.',
    'You are expected to follow the company\'s policies and keep company and client information confidential.',
  ]
  terms.forEach((term, index) => {
    const lines = doc.splitTextToSize(`${index + 1}. ${term}`, width - 4)
    doc.text(lines, left + 2, y)
    y += lines.length * LINE + 1.5
  })

  doc.text('We welcome you to the team and wish you every success.', left, (y += 4))

  // Signatures
  let signY = Math.max(y + 25, 250)
  if (signY > 282) {
    doc.addPage()
    signY = 40
  }
  doc.setLineWidth(0.3)
  doc.line(left, signY, left + 60, signY)
  doc.line(right - 60, signY, right, signY)
  doc.text('Employee signature', left, signY + 5)
  doc.text('Authorized signatory', right, signY + 5, { align: 'right' })
  if (context.approvedByName) {
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Approved by ${context.approvedByName}`, right, signY + 10, { align: 'right' })
  }

  doc.save(`Joining-Letter-${employee.employeeCode || employee.name.replace(/\s+/g, '-')}.pdf`)
}

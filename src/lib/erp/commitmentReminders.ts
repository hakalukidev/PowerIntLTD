import type { CustomerCommitment, CustomerRecord } from './types'
import { isCommitmentApproved } from './utils'

export type CommitmentReminder = {
  customer: CustomerRecord
  commitment: CustomerCommitment
}

export type CommitmentReminderGroup = {
  /** The due date (YYYY-MM-DD), or '' for commitments without one. */
  date: string
  when: 'overdue' | 'today' | 'upcoming' | 'no_date'
  items: CommitmentReminder[]
}

/** Today in the browser's time zone, as YYYY-MM-DD, to compare with commitment due dates. */
export function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Every approved commitment still pending, oldest due date first; ones without a date go last. */
export function pendingCommitmentReminders(customers: CustomerRecord[]): CommitmentReminder[] {
  return customers
    .flatMap((customer) =>
      Object.values(customer.commitments ?? {})
        .filter((commitment) => commitment.status === 'pending' && isCommitmentApproved(commitment))
        .map((commitment) => ({ customer, commitment }))
    )
    .sort((left, right) => {
      const leftDate = left.commitment.dueDate || '9999-12-31'
      const rightDate = right.commitment.dueDate || '9999-12-31'
      return leftDate.localeCompare(rightDate) || left.customer.name.localeCompare(right.customer.name)
    })
}

/** The commitments whose due date has come: due today or overdue. */
export function dueCommitmentReminders(customers: CustomerRecord[], today = localToday()) {
  return pendingCommitmentReminders(customers).filter(({ commitment }) => commitment.dueDate && commitment.dueDate <= today)
}

/** Pending commitments grouped by their due date, for the date-wise reminder list. */
export function groupRemindersByDate(reminders: CommitmentReminder[], today = localToday()): CommitmentReminderGroup[] {
  const groups = new Map<string, CommitmentReminderGroup>()
  for (const reminder of reminders) {
    const date = reminder.commitment.dueDate || ''
    const when = !date ? 'no_date' : date < today ? 'overdue' : date === today ? 'today' : 'upcoming'
    const group = groups.get(date) ?? { date, when, items: [] }
    group.items.push(reminder)
    groups.set(date, group)
  }
  return [...groups.values()]
}

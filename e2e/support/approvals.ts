import { expect, type Page } from '@playwright/test'

const APPROVE = /^(Authorize|Final approve)$/

/**
 * The Authorize / Final approve button on one of the party's own approval cards. A plain
 * `div` filter also matches the page wrapper around every card, whose first button may belong
 * to a real dealer, so this takes the innermost block holding both the name and the button and
 * insists it has exactly one.
 */
export async function partyApproveButton(page: Page, partyName: string) {
  const card = page.locator('div').filter({ hasText: partyName }).filter({ has: page.getByRole('button', { name: APPROVE }) }).last()
  const button = card.getByRole('button', { name: APPROVE })
  await expect(button).toHaveCount(1, { timeout: 20_000 })
  return button
}

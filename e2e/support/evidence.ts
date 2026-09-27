import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, type TestInfo } from '@playwright/test'

/**
 * Screenshots, downloaded PDFs and measured values from a test run are kept in
 * EVIDENCE_DIR (not Playwright's own output folder, which is wiped every run),
 * so they can be attached to the client report afterwards.
 */
export const EVIDENCE_DIR = path.resolve(process.env.EVIDENCE_DIR ?? 'test-reports/client-feedback')

export function evidencePath(name: string) {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  return path.join(EVIDENCE_DIR, name)
}

export async function screenshot(page: Page, name: string, testInfo: TestInfo, fullPage = false) {
  const file = evidencePath(`${name}.png`)
  await page.screenshot({ path: file, fullPage })
  testInfo.annotations.push({ type: 'screenshot', description: path.basename(file) })
  return file
}

/** Records a measured value or observation, shown in the JSON results and the client report. */
export function note(testInfo: TestInfo, description: string) {
  testInfo.annotations.push({ type: 'note', description })
}

export function pdfText(file: string) {
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
}

export function pdfInfo(file: string) {
  return execFileSync('pdfinfo', [file], { encoding: 'utf8' })
}

/** Renders the first page of a PDF to a PNG next to it, for the report. */
export function pdfFirstPagePng(file: string, name: string) {
  const prefix = evidencePath(name)
  execFileSync('pdftoppm', ['-png', '-r', '80', '-f', '1', '-l', '1', '-singlefile', file, prefix])
  return `${prefix}.png`
}

/**
 * Moves to a page the way a user would: through the sidebar, the phone tab bar,
 * or the phone menu. A full page load would end the session, because sign-in is
 * kept in memory only.
 */
export async function navigate(page: Page, href: string) {
  const direct = page.locator(`a[href="${href}"]:visible`).first()
  if (await direct.count()) {
    await direct.click()
  } else {
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('dialog').locator(`a[href="${href}"]`).click()
  }
  await page.waitForURL(`**${href}`)
  await expect(page.locator('h1')).toBeVisible()
}

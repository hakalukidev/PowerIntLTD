import { expect, test } from '@playwright/test'

/**
 * On Android Chrome, "Install" said "This app cannot be installed" and only a shortcut with a
 * Chrome badge could be made. The site now ships a web app manifest, sized and maskable icons,
 * an iPhone home-screen icon and a small service worker.
 */
test.describe('Installable app', () => {
  test('TC-PWA.1 the manifest has the app name, standalone display and start URL', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.ok()).toBe(true)
    const manifest = await response.json()
    expect(manifest).toMatchObject({
      name: 'Power International BD ERP',
      short_name: 'Power ERP',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    })
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i)

    const sizes = (purpose: string) =>
      manifest.icons.filter((icon: { purpose?: string }) => icon.purpose === purpose).map((icon: { sizes: string }) => icon.sizes)
    expect(sizes('any')).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(sizes('maskable')).toEqual(expect.arrayContaining(['192x192', '512x512']))
  })

  test('TC-PWA.2 every icon is a PNG of the size it claims', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json()
    const icons = [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }]
    for (const icon of icons) {
      const response = await request.get(icon.src)
      expect(response.ok(), icon.src).toBe(true)
      const png = await response.body()
      // PNG signature, then the IHDR chunk holds width and height at bytes 16-23.
      expect(png.subarray(1, 4).toString('ascii'), icon.src).toBe('PNG')
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.src).toBe(icon.sizes)
    }
  })

  test('TC-PWA.3 the page links the manifest, the iPhone icon and both theme colours', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/)
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png/)
    await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute('content', 'yes')
    await expect(page.locator('meta[name="theme-color"][media*="light"]')).toHaveCount(1)
    await expect(page.locator('meta[name="theme-color"][media*="dark"]')).toHaveCount(1)
  })

  test('TC-PWA.4 the service worker script is served and never cached by the browser', async ({ request }) => {
    const response = await request.get('/sw.js')
    expect(response.ok()).toBe(true)
    expect(response.headers()['cache-control']).toContain('no-cache')
    expect(await response.text()).toContain("request.mode !== 'navigate'")
  })
})

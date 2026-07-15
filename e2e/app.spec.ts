import { expect, test } from '@playwright/test'

const trackIds = ['dn-bass', 'dn-vamp', 'dn-puncture', 'dk-kick', 'dk-snare', 'dk-closed-hat', 'dk-open-hat', 'dk-rim', 'dk-clap', 'dk-texture']

test.beforeEach(async ({ page }) => {
  await page.addInitScript((ids) => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
    const listeners = new Map<string, Set<(payload: unknown) => void>>()
    const steps = (notes: number[]) => Array.from({ length: 16 }, (_, index) => ({ notes: index === 0 ? notes : [], velocity: 100, gate: 50, probability: 100 }))
    ;(window as unknown as { __SIGNAL_RACK_CALLS__: typeof calls }).__SIGNAL_RACK_CALLS__ = calls
    ;(window as unknown as { __SIGNAL_RACK_EMIT__: (event: string, payload: unknown) => void }).__SIGNAL_RACK_EMIT__ = (event, payload) => listeners.get(event)?.forEach((callback) => callback(payload))
    ;(window as unknown as { __SIGNAL_RACK_LISTENERS__: (event: string) => number }).__SIGNAL_RACK_LISTENERS__ = (event) => listeners.get(event)?.size ?? 0
    ;(window as unknown as { __SIGNAL_RACK_MOCK__: unknown }).__SIGNAL_RACK_MOCK__ = {
      async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
        calls.push({ command, args })
        if (command === 'list_outputs') return ['Mock Digitone', 'Mock Digitakt']
        if (command === 'get_status') return { playing: false, outputNames: { digitone: null, digitakt: null } }
        if (command === 'generate_seed') {
          return {
            summary: 'D · Dorian smoke · Broken pocket · Anchor bass · medium energy',
            tracks: ids.map((id) => ({
              id,
              length: id === 'dn-bass' ? 14 : 16,
              groove: id.startsWith('dk-') ? 'broken' : 'late',
              tone: id.startsWith('dn-') ? 72 : undefined,
              space: id.startsWith('dn-') ? 48 : undefined,
              steps: steps(id === 'dn-vamp' ? [50, 53, 57, 60] : id.startsWith('dk-') ? [60] : [38])
            }))
          }
        }
        return undefined
      },
      async listen(event: string, callback: (payload: unknown) => void): Promise<() => void> {
        const callbacks = listeners.get(event) ?? new Set()
        callbacks.add(callback)
        listeners.set(event, callbacks)
        return () => callbacks.delete(callback)
      }
    }
  }, trackIds)
})

test('drives the complete rack through the Tauri command boundary', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('.rack-unit')).toHaveCount(4)
  await expect(page.locator('.lfo-card')).toHaveCount(4)
  await expect(page.locator('.lane')).toHaveCount(3)
  await expect(page.locator('.drum-lane')).toHaveCount(7)
  await expect(page.locator('.drum-pad')).toHaveCount(112)
  await expect(page.locator('.drum-trigger')).toHaveCount(112)
  await expect(page.locator('.drum-edit')).toHaveCount(112)
  await expect(page.locator('.macro select')).toHaveCount(6)
  await expect(page.locator('.lfo-monitor')).toHaveCount(4)
  await expect(page.locator('.channel-bank select')).toHaveCount(10)
  await expect(page.locator('.lane [aria-label*="MIDI channel"], .drum-lane [aria-label*="MIDI channel"]')).toHaveCount(0)

  await page.locator('.digitone-module .module-output select').selectOption('0')
  await expect(page.getByRole('button', { name: /PLAY/ })).toBeEnabled()

  const bassToneRoute = page.getByLabel('BASS Tone modulation source', { exact: true })
  await bassToneRoute.selectOption('lfo-1')
  const bassToneDepth = page.getByLabel('BASS Tone modulation source depth')
  await bassToneDepth.fill('31')
  await expect(bassToneDepth).toHaveValue('31')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __SIGNAL_RACK_LISTENERS__: (event: string) => number }).__SIGNAL_RACK_LISTENERS__('lfo-levels'))).toBe(1)
  await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_EMIT__: (event: string, payload: unknown) => void }).__SIGNAL_RACK_EMIT__('lfo-levels', { 'lfo-1': 0.5, 'lfo-2': 0, 'lfo-3': 0, 'lfo-4': 0 }))
  await expect(page.getByRole('meter', { name: 'LFO 1 current level' })).toHaveAttribute('aria-valuenow', '0.5')
  await expect(page.locator('.lane').first().locator('.macro output').first()).toHaveText('62 → 78')
  await page.getByRole('button', { name: /SEED RACK/ }).click()
  await expect(page.locator('.seed-count strong')).toHaveText('01')
  await expect(bassToneRoute).toHaveValue('lfo-1')

  await page.getByRole('button', { name: /SPACE/ }).first().click()
  await expect(page.getByLabel('SPACE scene density')).toBeVisible()

  const kick = page.locator('.drum-lane').first()
  await kick.getByRole('button', { name: 'MUTE' }).click()
  await expect(kick.getByRole('button', { name: 'MUTED' })).toHaveAttribute('aria-pressed', 'true')
  await kick.getByRole('button', { name: 'MUTED' }).click()

  const digitaktModule = page.locator('.digitakt-module')
  await digitaktModule.getByRole('button', { name: /MUTE ALL/ }).click()
  await expect(digitaktModule).toHaveClass(/module-muted/)
  await expect(digitaktModule.getByRole('button', { name: /UNMUTE/ })).toHaveAttribute('aria-pressed', 'true')
  await digitaktModule.getByRole('button', { name: /UNMUTE/ }).click()

  const editKickStep = page.getByLabel('Edit T1 / KICK step 2')
  await editKickStep.click()
  await expect(page.locator('.drum-step-editor h2')).toHaveText('KICK · STEP 02')
  const trigState = page.locator('.drum-step-editor .trig-state')
  await expect(trigState).toHaveAttribute('aria-pressed', 'false')
  const drumVelocity = page.locator('.drum-step-editor').getByText('VELOCITY').locator('input')
  await drumVelocity.fill('117')
  await expect(drumVelocity).toHaveValue('117')
  const emptyKickStep = page.getByLabel('Toggle T1 / KICK step 2 on')
  const kickStepPad = kick.locator('.drum-pad').nth(1)
  await emptyKickStep.click()
  await expect(kickStepPad).toHaveClass(/hit/)
  await expect(trigState).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: /PLAY/ }).click()
  await expect(page.getByRole('button', { name: /STOP/ })).toBeEnabled()
  await page.getByRole('button', { name: /STOP/ }).click()

  const calls = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: Record<string, unknown> }> }).__SIGNAL_RACK_CALLS__)
  expect(calls.some((call) => call.command === 'generate_seed')).toBe(true)
  expect(calls.some((call) => call.command === 'start_transport')).toBe(true)
  expect(calls.some((call) => call.command === 'stop_transport')).toBe(true)
  const routedConfiguration = [...calls].reverse().find((call) => call.command === 'configure' && JSON.stringify(call.args).includes('toneLfo'))
  expect(routedConfiguration).toBeTruthy()
})

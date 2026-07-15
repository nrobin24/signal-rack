import { expect, test } from '@playwright/test'

const trackIds = ['dn-bass', 'dn-vamp', 'dn-puncture', 'dk-kick', 'dk-snare', 'dk-closed-hat', 'dk-open-hat', 'dk-rim', 'dk-clap', 'dk-texture']

test.beforeEach(async ({ page }) => {
  await page.addInitScript((ids) => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
    const listeners = new Map<string, Set<(payload: unknown) => void>>()
    const steps = (notes: number[]) => Array.from({ length: 64 }, (_, index) => ({ notes: index % 16 === 0 ? notes : [], velocity: 100, gate: 50, probability: 100 }))
    ;(window as unknown as { __SIGNAL_RACK_CALLS__: typeof calls }).__SIGNAL_RACK_CALLS__ = calls
    ;(window as unknown as { __SIGNAL_RACK_EMIT__: (event: string, payload: unknown) => void }).__SIGNAL_RACK_EMIT__ = (event, payload) => listeners.get(event)?.forEach((callback) => callback(payload))
    ;(window as unknown as { __SIGNAL_RACK_LISTENERS__: (event: string) => number }).__SIGNAL_RACK_LISTENERS__ = (event) => listeners.get(event)?.size ?? 0
    ;(window as unknown as { __SIGNAL_RACK_MOCK__: unknown }).__SIGNAL_RACK_MOCK__ = {
      async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
        calls.push({ command, args })
        if (command === 'list_outputs') return ['Mock Digitone', 'Mock Digitakt']
        if (command === 'get_status') return { playing: false, outputNames: { digitone: null, digitakt: null } }
        if (command === 'generate_seed') {
          const variation = Number(args?.variation ?? 0)
          const delays = (window as unknown as { __SIGNAL_RACK_GENERATION_DELAYS__?: Record<number, number> }).__SIGNAL_RACK_GENERATION_DELAYS__
          const delay = delays?.[variation] ?? 0
          if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay))
          const cycleMode = (args?.settings as { cycleMode?: string } | undefined)?.cycleMode
          return {
            summary: `D · Jungle launch · event / space / return · harmony leads · polyrhythm · Anchor bass · medium · VAR ${variation}`,
            tracks: ids.map((id) => ({
              id,
              length: cycleMode === 'poly' && (id === 'dn-bass' || id === 'dn-puncture') ? 14 : 64,
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
  await expect(page.locator('.step')).toHaveCount(48)
  await expect(page.locator('.drum-lane')).toHaveCount(7)
  await expect(page.locator('.drum-pad')).toHaveCount(112)
  await expect(page.locator('.drum-trigger')).toHaveCount(112)
  await expect(page.locator('.drum-edit')).toHaveCount(112)
  await expect(page.locator('.macro select')).toHaveCount(6)
  await expect(page.locator('.lfo-monitor')).toHaveCount(4)
  await expect(page.locator('.channel-bank select')).toHaveCount(10)
  await expect(page.locator('.channel-config')).toHaveCount(2)
  await expect(page.locator('.sequence-toolbar')).toHaveCount(2)
  await expect(page.locator('.channel-config[open]')).toHaveCount(0)
  await expect(page.locator('.hint, h1 em')).toHaveCount(0)
  await expect(page.locator('.lane [aria-label*="MIDI channel"], .drum-lane [aria-label*="MIDI channel"]')).toHaveCount(0)
  await expect(page.getByText('PHRASE ENGINE V2')).toBeVisible()

  await page.getByLabel('4-BAR SHAPE').selectOption('event-space')
  await page.getByLabel('PHRASE LEADER').selectOption('harmony')
  await page.getByLabel('STYLE').selectOption('jungle')
  await page.getByRole('group', { name: 'Cycle mode' }).getByRole('button', { name: 'POLY' }).click()

  const digitoneChannels = page.locator('.digitone-module .channel-config')
  await digitoneChannels.getByText('CHANNELS').click()
  await expect(digitoneChannels).toHaveAttribute('open', '')
  await expect(digitoneChannels.locator('.channel-bank')).toBeVisible()
  await digitoneChannels.getByText('CHANNELS').click()

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
  await page.getByRole('button', { name: '✦ GENERATE' }).click()
  await expect(page.locator('.seed-count strong')).toHaveText('01')
  await expect(bassToneRoute).toHaveValue('lfo-1')
  await expect(page.getByLabel('T1 / BASS length')).toHaveValue('14')
  await expect(page.getByLabel('T2 / VAMP length')).toHaveValue('64')
  await expect(page.getByLabel('T3 / PUNCTURE length')).toHaveValue('14')
  await expect(page.getByLabel('T1 / KICK length')).toHaveValue('64')

  await page.getByRole('button', { name: /SPACE/ }).first().click()
  await expect(page.getByLabel('SPACE scene density')).toBeVisible()

  const kick = page.locator('.drum-lane').first()
  await kick.getByRole('button', { name: 'MUTE' }).click()
  await expect(kick.getByRole('button', { name: 'MUTED' })).toHaveAttribute('aria-pressed', 'true')
  await kick.getByRole('button', { name: 'MUTED' }).click()

  const digitaktModule = page.locator('.digitakt-module')
  await digitaktModule.getByRole('button', { name: 'MUTE ALL' }).click()
  await expect(digitaktModule).toHaveClass(/module-muted/)
  await expect(digitaktModule.getByRole('button', { name: 'MUTED' })).toHaveAttribute('aria-pressed', 'true')
  await digitaktModule.getByRole('button', { name: 'MUTED' }).click()

  const editKickStep = page.getByLabel('Edit T1 / KICK step 2')
  await editKickStep.click()
  await expect(editKickStep).toHaveText('EDITING')
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

  const digitoneModule = page.locator('.digitone-module')
  const digitoneView = digitoneModule.getByRole('region', { name: 'Digitone sequence view' })
  const digitoneEditMode = digitoneView.getByRole('button', { name: 'EDIT 1 BAR' })
  const digitoneMapMode = digitoneView.getByRole('button', { name: 'VIEW 4 BARS' })
  const editModePosition = await digitoneEditMode.boundingBox()
  await digitoneMapMode.click()
  const mapModePosition = await digitoneEditMode.boundingBox()
  expect(Math.abs((mapModePosition?.x ?? 0) - (editModePosition?.x ?? 0))).toBeLessThan(1)
  await expect(digitoneModule.locator('.map-cell')).toHaveCount(192)
  await expect(digitoneModule.locator('.map-bar')).toHaveCount(12)
  await expect(digitoneView.locator('.page-switch button')).toHaveCount(4)
  await expect(digitoneView.locator('.page-switch button:disabled')).toHaveCount(4)
  await digitoneModule.getByLabel('Select T1 / BASS step 64: off').click()
  await expect(page.locator('.step-editor h2')).toHaveText('BASS · STEP 64')
  await digitoneEditMode.click()
  await expect(digitoneView.getByRole('button', { name: 'BAR 4 49–64' })).toHaveAttribute('aria-pressed', 'true')
  await expect(digitoneModule.getByLabel('Select T1 / BASS step 64')).toBeVisible()
  await page.getByLabel('T1 / BASS length').selectOption('64')

  const digitaktView = digitaktModule.getByRole('region', { name: 'Digitakt sequence view' })
  await digitaktView.getByRole('button', { name: 'VIEW 4 BARS' }).click()
  await expect(digitaktModule.locator('.map-cell')).toHaveCount(448)
  await expect(digitaktModule.locator('.map-bar')).toHaveCount(28)
  await digitaktModule.getByLabel('Select T1 / KICK step 64: off').click()
  await expect(page.locator('.drum-step-editor h2')).toHaveText('KICK · STEP 64')
  await digitaktView.getByRole('button', { name: 'EDIT 1 BAR' }).click()
  await expect(digitaktView.getByRole('button', { name: 'BAR 4 49–64' })).toHaveAttribute('aria-pressed', 'true')
  await expect(digitaktModule.getByLabel('Edit T1 / KICK step 64')).toBeVisible()
  await page.getByLabel('T1 / KICK length').selectOption('64')

  await page.getByRole('button', { name: /PLAY/ }).click()
  await expect(page.getByRole('button', { name: /STOP/ })).toBeEnabled()
  await page.getByRole('button', { name: /STOP/ }).click()

  const calls = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: Record<string, unknown> }> }).__SIGNAL_RACK_CALLS__)
  const generation = calls.find((call) => call.command === 'generate_seed')
  expect(generation).toBeTruthy()
  expect(generation?.args?.settings).toMatchObject({ rhythm: 'jungle', shape: 'event-space', leader: 'harmony', cycleMode: 'poly' })
  expect(calls.some((call) => call.command === 'start_transport')).toBe(true)
  expect(calls.some((call) => call.command === 'stop_transport')).toBe(true)
  const routedConfiguration = [...calls].reverse().find((call) => call.command === 'configure' && JSON.stringify(call.args).includes('toneLfo'))
  expect(routedConfiguration).toBeTruthy()
  expect(JSON.stringify(routedConfiguration?.args)).toContain('"length":64')
})

test('keeps rapid generation requests distinct and applies the newest response', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    ;(window as unknown as { __SIGNAL_RACK_GENERATION_DELAYS__: Record<number, number> }).__SIGNAL_RACK_GENERATION_DELAYS__ = { 1: 80, 2: 5 }
  })

  const generate = page.getByRole('button', { name: '✦ GENERATE' })
  await generate.dblclick()

  await expect(page.locator('.seed-count strong')).toHaveText('02')
  await expect(page.locator('.seed-result > strong')).toContainText('VAR 2')
  await expect(generate).toHaveAttribute('aria-busy', 'false')

  const variations = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { variation?: number } }> }).__SIGNAL_RACK_CALLS__
    .filter((call) => call.command === 'generate_seed')
    .map((call) => call.args?.variation))
  expect(variations).toEqual([1, 2])
})

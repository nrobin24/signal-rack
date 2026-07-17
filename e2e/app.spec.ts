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
        if (command === 'choose_lab_session_path') {
          const choice = (window as unknown as { __SIGNAL_RACK_EXPORT_CHOICE__?: string | null }).__SIGNAL_RACK_EXPORT_CHOICE__
          return choice === undefined ? args?.suggestedPath : choice
        }
        if (command === 'save_lab_session') return args?.path
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

  await expect(page.locator('.rack-unit')).toHaveCount(7)
  await expect(page.locator('.lfo-card')).toHaveCount(8)
  await expect(page.locator('.lane')).toHaveCount(3)
  await expect(page.locator('.step')).toHaveCount(48)
  await expect(page.locator('.drum-lane')).toHaveCount(7)
  await expect(page.locator('.drum-pad')).toHaveCount(112)
  await expect(page.locator('.drum-trigger')).toHaveCount(112)
  await expect(page.locator('.drum-edit')).toHaveCount(112)
  await expect(page.locator('.macro select')).toHaveCount(20)
  await expect(page.getByLabel('BASS Cutoff modulation source', { exact: true })).toHaveValue('off')
  await expect(page.getByLabel('BASS Delay modulation source', { exact: true })).toHaveValue('off')
  await expect(page.locator('.macro-readout').filter({ hasText: /^(TONE|SPACE)/ })).toHaveCount(0)
  await expect(page.getByLabel('BASS Octave modulation source', { exact: true })).toHaveValue('manual')
  await expect(page.locator('.octave-macro')).toHaveCount(3)
  const bassParameterBlocks = page.locator('.lane').first().locator('.macros.with-octave > div')
  const bassParameterSelectors = page.locator('.lane').first().locator('.macros.with-octave select')
  await expect(bassParameterBlocks).toHaveCount(3)
  await expect(bassParameterSelectors).toHaveCount(3)
  const parameterBoxes = await bassParameterBlocks.evaluateAll((blocks) => blocks.map((block) => block.getBoundingClientRect().toJSON()))
  const selectorBoxes = await bassParameterSelectors.evaluateAll((selectors) => selectors.map((selector) => selector.getBoundingClientRect().toJSON()))
  expect(Math.max(...parameterBoxes.map((box) => box.width)) - Math.min(...parameterBoxes.map((box) => box.width))).toBeLessThan(1)
  expect(Math.max(...selectorBoxes.map((box) => box.width)) - Math.min(...selectorBoxes.map((box) => box.width))).toBeLessThan(1)
  expect(Math.max(...selectorBoxes.map((box) => box.y)) - Math.min(...selectorBoxes.map((box) => box.y))).toBeLessThan(1)
  await expect(page.locator('.lfo-monitor')).toHaveCount(8)
  await expect(page.getByLabel('BASS Octave modulation source').locator('option')).toHaveCount(9)
  await expect(page.getByLabel('BASS Cutoff modulation source').locator('option')).toHaveCount(10)
  await expect(page.getByLabel('LFO 8 time')).toHaveValue('bars-64')
  await expect(page.locator('.channel-bank select')).toHaveCount(10)
  await expect(page.locator('.channel-config')).toHaveCount(0)
  await expect(page.locator('.module-setup')).toHaveCount(2)
  await expect(page.locator('.module-setup[open]')).toHaveCount(2)
  await expect(page.locator('.step-editor, .drum-step-editor')).toHaveCount(0)
  await expect(page.locator('.step.selected, .drum-pad.selected')).toHaveCount(0)
  await expect(page.locator('.sequence-toolbar')).toHaveCount(2)
  await expect(page.getByText('4 BARS · 64 STEPS')).toHaveCount(0)
  await expect(page.getByText('all voices')).toHaveCount(0)
  await expect(page.getByText('low-end focus')).toHaveCount(0)
  await expect(page.getByText(/SEED \/ PULSE \/ MODULATION/)).toHaveCount(0)
  await expect(page.getByText(/Select a MIDI output inside/)).toHaveCount(0)
  await expect(page.locator('.hint, h1 em')).toHaveCount(0)
  await expect(page.locator('.lane [aria-label*="MIDI channel"], .drum-lane [aria-label*="MIDI channel"]')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'PHRASE GENERATOR' })).toBeVisible()
  const lfoRows = await page.locator('.lfo-card').evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().y)))
  expect(new Set(lfoRows).size).toBe(1)
  await expect(page.getByText('SYNC', { exact: true })).toHaveCount(0)
  await expect(page.getByText('TRANSPORT CLOCK', { exact: true })).toHaveCount(0)
  await expect(page.getByText('REPLACE LANE', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/CLICK TO ADD/)).toHaveCount(0)
  await expect(page.locator('.euclidean-result, .euclidean-presets small')).toHaveCount(0)
  await expect(page.locator('.euclidean-presets button')).toHaveCount(12)
  await expect(page.locator('.euclidean-presets button.selected')).toHaveCount(1)
  await expect(page.locator('.euclidean-presets button.selected')).toHaveCSS('background-image', /repeating-linear-gradient/)
  await expect(page.getByLabel('Arpeggio target lane').locator('option')).toHaveCount(3)
  await expect(page.getByLabel('Arpeggio trigger placement')).toHaveValue('keep')
  await expect(page.locator('.mini-keyboard button')).toHaveCount(12)
  await expect(page.locator('.mini-keyboard button')).toHaveText(Array.from({ length: 12 }, () => ''))
  await expect(page.locator('.arpeggio-apply-group')).toContainText('APPLY TO')
  const generatorModules = page.locator('.seed-module, .lfo-module, .euclidean-module, .arpeggio-module')
  const generatorBoxes = await generatorModules.evaluateAll((modules) => modules.map((module) => module.getBoundingClientRect().toJSON()))
  expect(Math.max(...generatorBoxes.map((box) => box.width)) - Math.min(...generatorBoxes.map((box) => box.width))).toBeLessThan(1)
  expect(Math.max(...generatorBoxes.map((box) => box.x)) - Math.min(...generatorBoxes.map((box) => box.x))).toBeLessThan(1)
  const seedAction = page.getByRole('button', { name: 'GENERATE', exact: true })
  const [seedActionBox, seedRootBox, seedBox] = await Promise.all([seedAction.boundingBox(), page.getByLabel('ROOT').boundingBox(), page.locator('.seed-module .unit-face').boundingBox()])
  expect((seedActionBox?.y ?? 0)).toBeGreaterThan((seedRootBox?.y ?? 0))
  expect(Math.abs(((seedActionBox?.x ?? 0) + (seedActionBox?.width ?? 0)) - ((seedBox?.x ?? 0) + (seedBox?.width ?? 0) - 12))).toBeLessThan(4)
  const euclideanTarget = page.getByLabel('Euclidean target lane')
  const euclideanApply = page.getByRole('button', { name: 'APPLY EUCLIDEAN RHYTHM' })
  const [targetBox, applyBox, euclideanBox] = await Promise.all([euclideanTarget.boundingBox(), euclideanApply.boundingBox(), page.locator('.euclidean-module .unit-face').boundingBox()])
  expect((applyBox?.x ?? 0)).toBeGreaterThan((targetBox?.x ?? 0) + (targetBox?.width ?? 0))
  expect(Math.abs(((applyBox?.x ?? 0) + (applyBox?.width ?? 0)) - ((euclideanBox?.x ?? 0) + (euclideanBox?.width ?? 0) - 12))).toBeLessThan(4)
  const euclideanPresetBox = await page.locator('.euclidean-presets button').first().boundingBox()
  expect((applyBox?.y ?? 0)).toBeGreaterThan((euclideanPresetBox?.y ?? 0))
  const arpeggioTarget = page.getByLabel('Arpeggio target lane')
  const arpeggioApply = page.locator('.arpeggio-module').getByRole('button', { name: 'APPLY' })
  const [arpTargetBox, arpApplyBox, arpeggioBox] = await Promise.all([arpeggioTarget.boundingBox(), arpeggioApply.boundingBox(), page.locator('.arpeggio-module .unit-face').boundingBox()])
  expect((arpApplyBox?.x ?? 0)).toBeGreaterThan((arpTargetBox?.x ?? 0) + (arpTargetBox?.width ?? 0))
  expect(Math.abs(((arpApplyBox?.x ?? 0) + (arpApplyBox?.width ?? 0)) - ((arpeggioBox?.x ?? 0) + (arpeggioBox?.width ?? 0) - 12))).toBeLessThan(4)
  const actionBoxes = [seedActionBox, applyBox, arpApplyBox].filter((box): box is NonNullable<typeof box> => box !== null)
  expect(Math.max(...actionBoxes.map((box) => box.width)) - Math.min(...actionBoxes.map((box) => box.width))).toBeLessThan(1)
  expect(Math.max(...actionBoxes.map((box) => box.x)) - Math.min(...actionBoxes.map((box) => box.x))).toBeLessThan(1)
  const targetBoxes = [targetBox, arpTargetBox].filter((box): box is NonNullable<typeof box> => box !== null)
  expect(Math.max(...targetBoxes.map((box) => box.width)) - Math.min(...targetBoxes.map((box) => box.width))).toBeLessThan(1)
  expect(Math.max(...targetBoxes.map((box) => box.x)) - Math.min(...targetBoxes.map((box) => box.x))).toBeLessThan(1)
  await expect(page.getByLabel('LFO 1 time').locator('option[value="bars-64"]')).toHaveText('64 BARS')
  await expect(page.getByLabel('LFO 1 time').locator('option[value="bars-128"]')).toHaveText('128 BARS')
  await page.getByLabel('LFO 1 time').selectOption('bars-128')

  await page.getByLabel('4-BAR SHAPE').selectOption('event-space')
  await page.getByLabel('PHRASE LEADER').selectOption('harmony')
  await page.getByLabel('STYLE').selectOption('jungle')
  await page.getByRole('group', { name: 'Cycle mode' }).getByRole('button', { name: 'POLY' }).click()

  const digitoneSetup = page.locator('.digitone-module .module-setup')
  await expect(digitoneSetup).toHaveAttribute('open', '')
  await digitoneSetup.locator('.module-output select').selectOption('0')
  await expect(digitoneSetup).not.toHaveAttribute('open', '')
  await expect(digitoneSetup.locator('.module-output select')).not.toBeVisible()
  await digitoneSetup.getByLabel('digitone MIDI setup').click()
  await expect(digitoneSetup).toHaveAttribute('open', '')
  await expect(digitoneSetup.locator('.channel-bank')).toBeVisible()
  await digitoneSetup.getByLabel('digitone MIDI setup').click()
  await expect(page.getByRole('button', { name: /PLAY/ })).toBeEnabled()

  const bassToneRoute = page.getByLabel('BASS Cutoff modulation source', { exact: true })
  await bassToneRoute.selectOption('lfo-1')
  const bassOctaveRoute = page.getByLabel('BASS Octave modulation source', { exact: true })
  await bassOctaveRoute.selectOption('lfo-1')
  await page.getByRole('button', { name: 'BASS octave depth up' }).click()
  const activeSelectorBoxes = await bassParameterSelectors.evaluateAll((selectors) => selectors.map((selector) => selector.getBoundingClientRect().toJSON()))
  expect(Math.max(...activeSelectorBoxes.map((box) => box.y)) - Math.min(...activeSelectorBoxes.map((box) => box.y))).toBeLessThan(1)
  const bassToneDepth = page.getByLabel('BASS Cutoff modulation source depth')
  await bassToneDepth.fill('31')
  await expect(bassToneDepth).toHaveValue('31')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __SIGNAL_RACK_LISTENERS__: (event: string) => number }).__SIGNAL_RACK_LISTENERS__('lfo-levels'))).toBe(1)
  await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_EMIT__: (event: string, payload: unknown) => void }).__SIGNAL_RACK_EMIT__('lfo-levels', { 'lfo-1': 0.5, 'lfo-2': 0, 'lfo-3': 0, 'lfo-4': 0 }))
  await expect(page.getByRole('meter', { name: 'LFO 1 current level' })).toHaveAttribute('aria-valuenow', '0.5')
  await expect(page.locator('.lane').first().locator('.macro output').first()).toHaveText('78 · 31–93')
  await expect(page.locator('.lane').first().locator('.octave-macro output')).toHaveText('+1 · -2–+2')
  await page.getByRole('button', { name: 'GENERATE', exact: true }).click()
  await expect(bassToneRoute).toHaveValue('lfo-1')
  await expect(page.getByLabel('T1 / BASS length')).toHaveValue('14')
  await expect(page.getByLabel('T2 / VAMP length')).toHaveValue('64')
  await expect(page.getByLabel('T3 / PUNCTURE length')).toHaveValue('14')
  await expect(page.getByLabel('T1 / KICK length')).toHaveValue('64')

  const scenes = page.getByRole('region', { name: 'Scenes for Digitone and Digitakt' })
  await expect(scenes.getByRole('button')).toHaveCount(8)
  await expect(page.getByRole('region', { name: 'Digitakt arrangement scenes' })).toHaveCount(0)
  await expect(page.getByText('ARRANGEMENT', { exact: true })).toHaveCount(0)
  await expect(scenes.locator('.scene-matrix')).toHaveCount(0)
  await scenes.getByRole('button', { name: 'SPACE' }).click()
  await expect(scenes.getByRole('button', { name: 'SPACE' })).toHaveAttribute('aria-pressed', 'true')

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
  await page.getByRole('button', { name: 'Close KICK trig editor' }).click()
  await expect(page.locator('.drum-step-editor')).toHaveCount(0)

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
  await page.getByRole('button', { name: 'Close BASS cell editor' }).click()
  await expect(page.locator('.step-editor')).toHaveCount(0)

  const digitaktSetup = digitaktModule.locator('.module-setup')
  if (await digitaktSetup.getAttribute('open') !== null) await digitaktSetup.getByLabel('digitakt MIDI setup').click()
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
  expect(JSON.stringify(routedConfiguration?.args)).toContain('"octaveLfo":"lfo-1"')
  expect(JSON.stringify(routedConfiguration?.args)).toContain('"octaveLfoDepth":2')
  const playedConfiguration = [...calls].reverse().find((call) => call.command === 'configure')
  expect(playedConfiguration?.args?.config).toMatchObject({ scene: 'space', digitaktScene: 'tops' })
  expect(JSON.stringify(playedConfiguration?.args?.config)).toContain('"period":"bars-128"')
})

test('replaces one lane with a Euclidean cycle and carries nearby voicings onto its hits', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Euclidean target lane').selectOption('dn-vamp')
  await page.getByRole('button', { name: /TRESILLO: CUBAN/ }).click()
  await page.locator('.euclidean-module').getByRole('button', { name: /APPLY EUCLIDEAN RHYTHM/ }).click()

  await expect(page.getByLabel('T2 / VAMP length')).toHaveValue('8')
  await expect(page.getByLabel('T1 / BASS length')).toHaveValue('14')
  await expect(page.getByLabel('T1 / KICK length')).toHaveValue('16')

  const vamp = page.locator('.lane').filter({ hasText: 'T2 / VAMP' })
  await expect(vamp.getByLabel('Select T2 / VAMP step 1', { exact: true })).toContainText('F3 C4 E4')
  await expect(vamp.getByLabel('Select T2 / VAMP step 2', { exact: true })).toContainText('REST')
  await expect(vamp.getByLabel('Select T2 / VAMP step 4', { exact: true })).toContainText('F3 C4 E4')
  await expect(vamp.getByLabel('Select T2 / VAMP step 7', { exact: true })).toContainText('C4 F4 G4')
  await expect(vamp.getByLabel('Select T2 / VAMP step 9', { exact: true })).toHaveClass(/outside-cycle/)
  const calls = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { config?: { tracks?: Array<{ id: string; length: number; steps: Array<{ notes: number[] }> }> } } }> }).__SIGNAL_RACK_CALLS__)
  const applied = [...calls].reverse().find((call) => call.command === 'configure')
  const track = applied?.args?.config?.tracks?.find((candidate) => candidate.id === 'dn-vamp')
  expect(track?.length).toBe(8)
  expect(track?.steps.slice(0, 8).map((step) => step.notes.length > 0)).toEqual([true, false, false, true, false, false, true, false])
})

test('seeds the Digitone arpeggiator from the phrase and can create an alternating trigger lane', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'GENERATE', exact: true }).click()

  for (const note of ['C', 'D', 'F', 'A']) await expect(page.getByLabel(`Arpeggio note ${note}`, { exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Arpeggio note E', { exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByLabel('Arpeggio note E', { exact: true }).click()
  await page.getByLabel('Arpeggio target lane').selectOption('dn-puncture')
  await page.getByLabel('Arpeggio lowest octave').selectOption('4')
  await page.getByLabel('Arpeggio highest octave').selectOption('4')
  await page.getByLabel('Arpeggio direction').selectOption('down')
  await page.getByLabel('Arpeggio note repeat').selectOption('2')
  await page.getByLabel('Arpeggio trigger placement').selectOption('every-2')
  await page.locator('.arpeggio-module').getByRole('button', { name: 'APPLY' }).click()

  const calls = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { config?: { tracks?: Array<{ id: string; steps: Array<{ notes: number[] }> }> } } }> }).__SIGNAL_RACK_CALLS__)
  const applied = [...calls].reverse().find((call) => call.command === 'configure')
  const puncture = applied?.args?.config?.tracks?.find((track) => track.id === 'dn-puncture')
  expect(puncture?.steps.slice(0, 8).map((step) => step.notes)).toEqual([[69], [], [69], [], [65], [], [65], []])
})

test('keeps rapid generation requests distinct and applies the newest response', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    ;(window as unknown as { __SIGNAL_RACK_GENERATION_DELAYS__: Record<number, number> }).__SIGNAL_RACK_GENERATION_DELAYS__ = { 1: 80, 2: 5 }
  })

  const generate = page.getByRole('button', { name: 'GENERATE', exact: true })
  await generate.dblclick()

  await expect(page.locator('.seed-result > strong')).toContainText('VAR 2')
  await expect(generate).toHaveAttribute('aria-busy', 'false')

  const variations = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { variation?: number } }> }).__SIGNAL_RACK_CALLS__
    .filter((call) => call.command === 'generate_seed')
    .map((call) => call.args?.variation))
  expect(variations).toEqual([1, 2])
})

test('exports Generator Lab sessions through Save As and keeps canceled work unexported', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'GENERATOR LAB' }).click()
  await page.getByRole('button', { name: 'FREEZE 8-CANDIDATE BATCH' }).click()
  await expect(page.getByRole('button', { name: 'EXPORT SESSION' })).toBeVisible()

  await page.evaluate(() => {
    ;(window as unknown as { __SIGNAL_RACK_EXPORT_CHOICE__: null }).__SIGNAL_RACK_EXPORT_CHOICE__ = null
  })
  await page.getByRole('button', { name: 'EXPORT SESSION' }).click()
  await expect(page.getByText('EXPORT CANCELED · SESSION REMAINS UNEXPORTED')).toBeVisible()
  await expect(page.getByText('● UNEXPORTED')).toBeVisible()

  await page.evaluate(() => {
    ;(window as unknown as { __SIGNAL_RACK_EXPORT_CHOICE__: string }).__SIGNAL_RACK_EXPORT_CHOICE__ = '/Users/test/Documents/my-session.json'
  })
  await page.getByRole('button', { name: 'EXPORT SESSION' }).click()
  await expect(page.getByText('SAVED · my-session.json')).toBeVisible()
  await expect(page.getByText('● UNEXPORTED')).toHaveCount(0)

  const calls = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: Record<string, unknown> }> }).__SIGNAL_RACK_CALLS__)
  const save = calls.find((call) => call.command === 'save_lab_session')
  expect(save?.args?.path).toBe('/Users/test/Documents/my-session.json')
  expect(String(save?.args?.contents)).toContain('"schemaVersion": 2')
})

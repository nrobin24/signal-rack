import { expect, test } from '@playwright/test'

const trackIds = ['dn-bass', 'dn-vamp', 'dn-puncture', 'td3-acid', 'dk-kick', 'dk-snare', 'dk-closed-hat', 'dk-open-hat', 'dk-rim', 'dk-clap', 'dk-texture']

test.beforeEach(async ({ page }) => {
  await page.addInitScript((ids) => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
    const listeners = new Map<string, Set<(payload: unknown) => void>>()
    let audioMonitor = { active: false, inputName: null as string | null, outputName: null as string | null, sampleRate: null as number | null, level: 1.5 }
    const steps = (notes: number[]) => Array.from({ length: 64 }, (_, index) => ({ notes: index % 16 === 0 ? notes : [], velocity: 100, gate: 50, probability: 100 }))
    const acidSteps = () => Array.from({ length: 64 }, (_, index) => {
      const local = index % 16
      const active = [0, 3, 6, 7, 10, 14].includes(local)
      return { notes: active ? [local === 7 ? 49 : 37 + (local % 5)] : [], velocity: local === 0 || local === 14 ? 127 : 92, gate: local === 6 ? 100 : 54, probability: 100, accent: local === 0 || local === 14, slide: local === 6 }
    })
    ;(window as unknown as { __SIGNAL_RACK_CALLS__: typeof calls }).__SIGNAL_RACK_CALLS__ = calls
    ;(window as unknown as { __SIGNAL_RACK_EMIT__: (event: string, payload: unknown) => void }).__SIGNAL_RACK_EMIT__ = (event, payload) => listeners.get(event)?.forEach((callback) => callback(payload))
    ;(window as unknown as { __SIGNAL_RACK_LISTENERS__: (event: string) => number }).__SIGNAL_RACK_LISTENERS__ = (event) => listeners.get(event)?.size ?? 0
    ;(window as unknown as { __SIGNAL_RACK_MOCK__: unknown }).__SIGNAL_RACK_MOCK__ = {
      async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
        calls.push({ command, args })
        if (command === 'list_outputs') return ['Mock Digitone', 'Mock Digitakt', 'Mock TD-3']
        if (command === 'list_audio_devices') return { inputs: ['Mock Audio Interface'], outputs: ['Mock MacBook Speakers'], defaultInput: 'Mock Audio Interface', defaultOutput: 'Mock MacBook Speakers' }
        if (command === 'get_audio_monitor_status') return audioMonitor
        if (command === 'start_audio_monitor') {
          audioMonitor = { active: true, inputName: 'Mock Audio Interface', outputName: 'Mock MacBook Speakers', sampleRate: 48000, level: Number(args?.level ?? 1) }
          return undefined
        }
        if (command === 'set_audio_monitor_level') {
          audioMonitor = { ...audioMonitor, level: Number(args?.level ?? 1) }
          return undefined
        }
        if (command === 'stop_audio_monitor') {
          audioMonitor = { active: false, inputName: null, outputName: null, sampleRate: null, level: audioMonitor.level }
          return undefined
        }
        if (command === 'get_status') return { playing: false, outputNames: (window as unknown as { __SIGNAL_RACK_OUTPUT_NAMES__?: { digitone: string | null; digitakt: string | null; td3: string | null } }).__SIGNAL_RACK_OUTPUT_NAMES__ ?? { digitone: 'Mock Digitone', digitakt: 'Mock Digitakt', td3: 'Mock TD-3' } }
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
              steps: id === 'td3-acid' ? acidSteps() : steps(id === 'dn-vamp' ? [50, 53, 57, 60] : id.startsWith('dk-') ? [60] : [38])
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

test('routes a selected native audio input to an output independently of transport', async ({ page }) => {
  await page.goto('/')

  const monitor = page.getByRole('region', { name: 'Audio monitor' })
  await expect(monitor.getByLabel('Audio input')).toHaveValue('0')
  await expect(monitor.getByLabel('Audio output')).toHaveValue('0')
  await monitor.getByRole('button', { name: 'MONITOR' }).click()
  await expect(monitor.getByRole('button', { name: 'MONITORING' })).toHaveAttribute('aria-pressed', 'true')
  await expect(monitor.getByText('48 KHZ')).toBeVisible()
  await expect(page.getByRole('button', { name: '■ STOP' })).toBeDisabled()

  await monitor.getByLabel('Audio monitor level').fill('250')
  await monitor.getByRole('button', { name: 'MONITORING' }).click()
  await expect(monitor.getByRole('button', { name: 'MONITOR' })).toHaveAttribute('aria-pressed', 'false')

  const calls = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: Record<string, unknown> }> }).__SIGNAL_RACK_CALLS__)
  expect(calls.find((call) => call.command === 'start_audio_monitor')?.args).toEqual({ inputIndex: 0, outputIndex: 0, level: 1.5 })
  expect(calls.find((call) => call.command === 'set_audio_monitor_level')?.args).toEqual({ level: 2.5 })
  expect(calls.some((call) => call.command === 'stop_audio_monitor')).toBe(true)
})

test('shows routing in the center and preserves instrument heights while devices are disconnected', async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __SIGNAL_RACK_OUTPUT_NAMES__: { digitone: string | null; digitakt: string | null; td3: string | null } }).__SIGNAL_RACK_OUTPUT_NAMES__ = { digitone: null, digitakt: null, td3: null } })
  await page.goto('/')

  const digitone = page.locator('.digitone-module')
  const disconnectedHeight = (await digitone.boundingBox())?.height ?? 0
  await expect(digitone).toHaveClass(/module-unconfigured/)
  await expect(digitone.locator('.module-body')).toHaveCount(0)
  await expect(digitone.getByRole('button', { name: 'MUTED' })).toBeDisabled()
  await expect(digitone.getByRole('button', { name: 'MUTED' })).toHaveAttribute('title', 'Select a MIDI output to enable this instrument.')
  await expect(digitone.getByRole('region', { name: 'digitone connection setup' })).toBeVisible()
  await digitone.locator('.module-output select').selectOption('0')
  await expect(digitone.locator('.module-body')).toBeVisible()
  await expect(digitone.getByRole('button', { name: 'MUTE ALL' })).toBeEnabled()
  const connectedHeight = (await digitone.boundingBox())?.height ?? 0
  expect(Math.abs(connectedHeight - disconnectedHeight)).toBeLessThan(1)

  const digitakt = page.locator('.digitakt-module')
  const disconnectedDigitaktHeight = (await digitakt.boundingBox())?.height ?? 0
  await digitakt.locator('.module-output select').selectOption('1')
  await expect(digitakt.locator('.module-body')).toBeVisible()
  const connectedDigitaktHeight = (await digitakt.boundingBox())?.height ?? 0
  expect(Math.abs(connectedDigitaktHeight - disconnectedDigitaktHeight)).toBeLessThan(1)
})

test('keeps the rack intact and exposes horizontal scrolling below its minimum usable width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
  expect(overflow.scroll).toBeGreaterThan(overflow.client)
})

test('only shows vertical scrolling when rack content exceeds the window', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1400 })
  await page.goto('/')

  const rackBottom = Math.ceil((await page.locator('.rack').boundingBox())?.y ?? 0) + Math.ceil((await page.locator('.rack').boundingBox())?.height ?? 0)
  await page.setViewportSize({ width: 1800, height: rackBottom })
  const fittingPage = await page.evaluate(() => ({ client: document.documentElement.clientHeight, scroll: document.documentElement.scrollHeight }))
  expect(fittingPage.scroll).toBe(fittingPage.client)

  await page.setViewportSize({ width: 1800, height: rackBottom - 1 })
  const overflowingPage = await page.evaluate(() => ({ client: document.documentElement.clientHeight, scroll: document.documentElement.scrollHeight }))
  expect(overflowingPage.scroll).toBeGreaterThan(overflowingPage.client)
})

test('standardizes rack modules on small, medium, and large heights', async ({ page }) => {
  await page.goto('/')

  const mediumHeights = await page.locator('.seed-module, .euclidean-module, .arpeggio-module, .lfo-module, .digitone-module').evaluateAll((modules) => modules.map((module) => module.getBoundingClientRect().height))
  expect(new Set(mediumHeights)).toEqual(new Set([300]))
  const smallHeight = (await page.locator('.scene-module').boundingBox())?.height ?? 0
  expect(smallHeight).toBe(223)
  expect((await page.locator('.td3-module').boundingBox())?.height).toBe(223)
  await expect(page.locator('.digitakt-module')).toHaveCSS('min-height', '454px')
  const largeHeight = (await page.locator('.digitakt-module').boundingBox())?.height ?? 0
  expect(largeHeight).toBe(454)
  const gap = 8
  expect((smallHeight + gap) / 3).toBe((mediumHeights[0] + gap) / 4)
  expect((mediumHeights[0] + gap) / 4).toBe((largeHeight + gap) / 6)
  const [generatorHeight, instrumentHeight] = await Promise.all([page.locator('.generator-column').evaluate((column) => column.getBoundingClientRect().height), page.locator('.instrument-column').evaluate((column) => column.getBoundingClientRect().height)])
  expect(generatorHeight).toBe(instrumentHeight)
})

test('uses hardware-inspired identity colors for each instrument', async ({ page }) => {
  await page.goto('/')

  const instrumentOrder = await page.locator('.instrument-column > .rack-unit').evaluateAll((modules) => modules.map((module) => (module as HTMLElement).className.split(' ').find((name: string) => name.endsWith('-module'))))
  expect(instrumentOrder).toEqual(['scene-module', 'digitone-module', 'digitakt-module', 'td3-module'])
  await expect(page.locator('.digitone-module')).toHaveCSS('--instrument-primary', '#55c8c1')
  await expect(page.locator('.digitakt-module')).toHaveCSS('--instrument-primary', '#ef9848')
  await expect(page.locator('.td3-module')).toHaveCSS('--instrument-primary', '#ead63d')
})

test('loops enabled mixer scenes on transport-clock bar boundaries', async ({ page }) => {
  await page.goto('/')

  const scenes = page.getByRole('region', { name: 'Club arrangement scenes' })
  await page.getByLabel('Scene advance length').selectOption('4')
  await scenes.getByRole('button', { name: 'Remove GROOVE from auto loop' }).click()
  await scenes.getByRole('button', { name: 'INTRO', exact: true }).click()
  await page.getByRole('button', { name: 'AUTO OFF' }).click()
  await expect(page.getByRole('button', { name: 'AUTO ON' })).toHaveAttribute('aria-pressed', 'true')

  await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_EMIT__: (event: string, payload: unknown) => void }).__SIGNAL_RACK_EMIT__('sequencer-clock-step', 64))
  await expect(scenes.getByRole('button', { name: 'BUILD', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('generates the displayed Warm House and House Interlock settings as the playable startup base', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('READY TO MUTATE')).toBeVisible()

  const calls = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { variation?: number; settings?: Record<string, unknown>; config?: { tracks?: Array<{ id: string; length: number }> } } }> }).__SIGNAL_RACK_CALLS__)
  const startupRequests = calls.filter((call) => call.command === 'generate_seed' && call.args?.variation === 0)
  expect(startupRequests).toHaveLength(1)
  expect(startupRequests[0].args?.settings).toMatchObject({ root: 1, harmony: 'house', bassRole: 'answer', rhythm: 'house', energy: 'medium', shape: 'aa-turn', leader: 'bass', cycleMode: 'auto' })
  const startupConfiguration = [...calls].reverse().find((call) => call.command === 'configure')
  expect(startupConfiguration?.args?.config?.tracks).toHaveLength(11)
  expect(startupConfiguration?.args?.config?.tracks?.find((track) => track.id === 'dn-bass')?.length).toBe(64)
})

test('loads every analyzed track preset as a complete phrase and tempo configuration', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('READY TO MUTATE')).toBeVisible()

  const presets = [
    { id: 'pangaea-router', bpm: '138', root: '2', harmony: 'phrygian-dyads', bassRole: 'minor-driver', rhythm: 'two-step', energy: 'high', shape: 'question-answer', leader: 'bass', cycle: 'poly' },
    { id: 'moodymann-black-mahogani', bpm: '124', root: '6', harmony: 'detroit-dorian', bassRole: 'jazz-walk', rhythm: 'human-house', energy: 'medium', shape: 'aa-turn', leader: 'harmony', cycle: 'poly' },
    { id: 'photek-hidden-camera', bpm: '170', root: '7', harmony: 'noir-phrygian', bassRole: 'semitone', rhythm: 'chopped-breaks', energy: 'high', shape: 'call-challenge', leader: 'pulse', cycle: 'poly' },
    { id: 'lone-meeker-warm-energy', bpm: '94', root: '8', harmony: 'rave-major', bassRole: 'jazz-walk', rhythm: 'dusty-boom-bap', energy: 'medium', shape: 'aa-turn', leader: 'harmony', cycle: 'auto' },
    { id: 'lfo-leeds-warehouse', bpm: '125', root: '0', harmony: 'warehouse-minor', bassRole: 'monolith', rhythm: 'warehouse', energy: 'high', shape: 'event-space', leader: 'pulse', cycle: 'locked' },
    { id: 'drexciya-andreaen-sand-dunes', bpm: '128', root: '4', harmony: 'aquatic-minor', bassRole: 'minor-driver', rhythm: 'aquatic-electro', energy: 'high', shape: 'call-challenge', leader: 'bass', cycle: 'poly' },
    { id: 'back-2-basics-fighting-vipers', bpm: '164', root: '4', harmony: 'darkcore-minor', bassRole: 'minor-driver', rhythm: 'darkcore-jungle', energy: 'high', shape: 'event-space', leader: 'pulse', cycle: 'poly' }
  ]
  const presetSelect = page.getByLabel('PRESET')
  await expect(presetSelect.locator('option')).toHaveCount(8)

  for (const preset of presets) {
    await presetSelect.selectOption(preset.id)
    await expect(page.getByLabel('BPM')).toHaveValue(preset.bpm)
    await expect(page.getByLabel('ROOT', { exact: true })).toHaveValue(preset.root)
    await expect(page.getByLabel('HARMONY')).toHaveValue(preset.harmony)
    await expect(page.getByLabel('BASS ROLE')).toHaveValue(preset.bassRole)
    await expect(page.getByLabel('STYLE')).toHaveValue(preset.rhythm)
    await expect(page.getByLabel('4-BAR SHAPE')).toHaveValue(preset.shape)
    await expect(page.getByLabel('PHRASE LEADER')).toHaveValue(preset.leader)
    await expect(page.getByRole('group', { name: 'Energy' }).getByRole('button', { name: preset.energy, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: 'Cycle mode' }).getByRole('button', { name: preset.cycle.toUpperCase(), exact: true })).toHaveAttribute('aria-pressed', 'true')
  }

  await page.getByLabel('ROOT', { exact: true }).selectOption('3')
  await expect(presetSelect).toHaveValue('')
})

test('drives the complete rack through the Tauri command boundary', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('READY TO MUTATE')).toBeVisible()

  await expect(page.locator('.rack-unit')).toHaveCount(8)
  await expect(page.locator('.lfo-card')).toHaveCount(4)
  await expect(page.locator('.lane')).toHaveCount(4)
  await expect(page.locator('.step')).toHaveCount(64)
  await expect(page.locator('.drum-lane')).toHaveCount(7)
  await expect(page.locator('.drum-pad')).toHaveCount(112)
  await expect(page.locator('.drum-trigger')).toHaveCount(112)
  await expect(page.locator('.drum-edit')).toHaveCount(112)
  const sequenceWidths = await page.locator('.step-grid, .drum-grid').evaluateAll((grids) => grids.map((grid) => grid.getBoundingClientRect().width))
  expect(Math.max(...sequenceWidths) - Math.min(...sequenceWidths)).toBeLessThan(1)
  const modulationWidths = await page.locator('.lane > .macros, .drum-lane > .macros').evaluateAll((panels) => panels.map((panel) => panel.getBoundingClientRect().width))
  expect(Math.max(...modulationWidths) - Math.min(...modulationWidths)).toBeLessThan(1)
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
  await expect(page.locator('.lfo-monitor')).toHaveCount(4)
  await expect(page.getByLabel('BASS Octave modulation source').locator('option')).toHaveCount(5)
  await expect(page.getByLabel('BASS Cutoff modulation source').locator('option')).toHaveCount(6)
  await expect(page.getByLabel('LFO 4 time')).toHaveValue('bars-4')
  await expect(page.locator('.channel-bank select')).toHaveCount(0)
  await expect(page.locator('.channel-config')).toHaveCount(0)
  await expect(page.locator('.module-setup')).toHaveCount(3)
  await expect(page.locator('.module-setup-modal')).toHaveCount(0)
  await expect(page.locator('.step-editor, .drum-step-editor')).toHaveCount(0)
  await expect(page.locator('.step.selected, .drum-pad.selected')).toHaveCount(0)
  await expect(page.locator('.sequence-toolbar')).toHaveCount(3)
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
  await expect(page.getByLabel('Arpeggio target lane').locator('option')).toHaveCount(15)
  await expect(page.getByLabel('ROOT', { exact: true })).toHaveValue('1')
  await expect(page.getByLabel('HARMONY')).toHaveValue('house')
  await expect(page.getByLabel('STYLE')).toHaveValue('house')
  await expect(page.getByLabel('BASS ROLE')).toHaveValue('answer')
  await expect(page.getByLabel('Arpeggio root')).toHaveValue('1')
  await expect(page.getByLabel('Arpeggio scale')).toHaveValue('minor')
  await expect(page.getByLabel('Phrase target lane')).toHaveValue('all')
  await expect(page.getByLabel('Arpeggio trigger placement')).toHaveValue('keep')
  await expect(page.locator('.mini-keyboard button')).toHaveCount(12)
  await expect(page.locator('.mini-keyboard button')).toHaveText(Array.from({ length: 12 }, () => ''))
  const keyStateStyles = await page.locator('.white-keys button.selected, .white-keys button:not(.selected), .black-key.selected, .black-key:not(.selected)').evaluateAll((keys) => keys.map((key) => { const style = getComputedStyle(key); return `${style.backgroundColor}|${style.borderColor}|${style.boxShadow}` }))
  expect(new Set(keyStateStyles).size).toBe(4)
  await expect(page.locator('.generator-apply-group')).toHaveCount(3)
  const applyGroupBoxes = await page.locator('.generator-apply-group').evaluateAll((groups) => groups.map((group) => group.getBoundingClientRect().toJSON()))
  expect(Math.max(...applyGroupBoxes.map((box) => box.width)) - Math.min(...applyGroupBoxes.map((box) => box.width))).toBeLessThan(1)
  expect(Math.max(...applyGroupBoxes.map((box) => box.x + box.width)) - Math.min(...applyGroupBoxes.map((box) => box.x + box.width))).toBeLessThan(1)
  const applySelectBoxes = await page.locator('.generator-apply-group select').evaluateAll((selects) => selects.map((select) => select.getBoundingClientRect().toJSON()))
  const applyButtonBoxes = await page.locator('.generator-apply-action').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON()))
  expect(Math.max(...applySelectBoxes.map((box) => box.width)) - Math.min(...applySelectBoxes.map((box) => box.width))).toBeLessThan(1)
  expect(Math.max(...applyButtonBoxes.map((box) => box.width)) - Math.min(...applyButtonBoxes.map((box) => box.width))).toBeLessThan(1)
  await expect(page.getByRole('heading', { name: 'MODULATION SOURCE' })).toBeVisible()
  const generatorModules = page.locator('.seed-module, .lfo-module, .euclidean-module, .arpeggio-module')
  const [generatorColumnBox, instrumentColumnBox] = await Promise.all([page.locator('.generator-column').boundingBox(), page.locator('.instrument-column').boundingBox()])
  expect((instrumentColumnBox?.width ?? 0) / (generatorColumnBox?.width ?? 1)).toBeCloseTo(7 / 3, 1)
  const generatorBoxes = await generatorModules.evaluateAll((modules) => modules.map((module) => module.getBoundingClientRect().toJSON()))
  expect(Math.max(...generatorBoxes.map((box) => box.width)) - Math.min(...generatorBoxes.map((box) => box.width))).toBeLessThan(1)
  expect(Math.max(...generatorBoxes.map((box) => box.x)) - Math.min(...generatorBoxes.map((box) => box.x))).toBeLessThan(1)
  const widgetBoxes = await page.locator('.euclidean-widget, .arpeggio-widget, .scene-widget').evaluateAll((widgets) => widgets.map((widget) => widget.getBoundingClientRect().toJSON()))
  expect(widgetBoxes).toHaveLength(3)
  expect(Math.max(...widgetBoxes.map((box) => box.height)) - Math.min(...widgetBoxes.map((box) => box.height))).toBeLessThan(1)
  const widgetRatios = await page.locator('.generator-widget-row').evaluateAll((rows) => rows.map((row) => { const widget = row.querySelector('.generator-widget'); return widget ? widget.getBoundingClientRect().width / row.getBoundingClientRect().width : 0 }))
  for (const ratio of widgetRatios) expect(ratio).toBeGreaterThan(.64)
  for (const ratio of widgetRatios) expect(ratio).toBeLessThan(.68)
  const sceneBox = await page.locator('.scene-module').boundingBox()
  const td3Box = await page.locator('.td3-module').boundingBox()
  const digitoneBox = await page.locator('.digitone-module').boundingBox()
  expect(Math.abs((sceneBox?.height ?? 0) - (td3Box?.height ?? 0))).toBeLessThan(1)
  expect((sceneBox?.y ?? 0) + (sceneBox?.height ?? 0)).toBeLessThanOrEqual(digitoneBox?.y ?? 0)
  const seedAction = page.getByRole('button', { name: 'APPLY PHRASE', exact: true })
  const [seedActionBox, seedRootBox, seedBox] = await Promise.all([seedAction.boundingBox(), page.getByLabel('ROOT', { exact: true }).boundingBox(), page.locator('.seed-module .unit-face').boundingBox()])
  expect((seedActionBox?.y ?? 0)).toBeGreaterThan((seedRootBox?.y ?? 0))
  expect(Math.abs(((seedActionBox?.x ?? 0) + (seedActionBox?.width ?? 0)) - ((seedBox?.x ?? 0) + (seedBox?.width ?? 0) - 12))).toBeLessThan(4)
  const euclideanTarget = page.getByLabel('Euclidean target lane')
  const euclideanApply = page.getByRole('button', { name: 'APPLY EUCLIDEAN' })
  const [targetBox, applyBox] = await Promise.all([euclideanTarget.boundingBox(), euclideanApply.boundingBox()])
  expect(Math.abs((applyBox?.y ?? 0) - (targetBox?.y ?? 0))).toBeLessThan(4)
  const euclideanPresetBox = await page.locator('.euclidean-presets button').first().boundingBox()
  expect((applyBox?.y ?? 0)).toBeGreaterThan((euclideanPresetBox?.y ?? 0))
  const arpeggioTarget = page.getByLabel('Arpeggio target lane')
  const arpeggioApply = page.locator('.arpeggio-module').getByRole('button', { name: 'APPLY' })
  const [arpTargetBox, arpApplyBox] = await Promise.all([arpeggioTarget.boundingBox(), arpeggioApply.boundingBox()])
  expect(Math.abs((arpApplyBox?.y ?? 0) - (arpTargetBox?.y ?? 0))).toBeLessThan(4)
  await expect(page.getByLabel('LFO 1 time').locator('option[value="bars-64"]')).toHaveText('64 BARS')
  await expect(page.getByLabel('LFO 1 time').locator('option[value="bars-128"]')).toHaveText('128 BARS')
  await page.getByLabel('LFO 1 time').selectOption('bars-128')

  await page.getByLabel('4-BAR SHAPE').selectOption('event-space')
  await page.getByLabel('PHRASE LEADER').selectOption('harmony')
  await page.getByLabel('STYLE').selectOption('jungle')
  await page.getByRole('group', { name: 'Cycle mode' }).getByRole('button', { name: 'POLY' }).click()

  const digitoneSetup = page.locator('.digitone-module .module-setup')
  await digitoneSetup.getByLabel('digitone MIDI setup').click()
  const digitoneRouting = page.getByRole('dialog', { name: 'digitone MIDI setup' })
  await expect(digitoneRouting.locator('.module-output select')).toHaveValue('0')
  await expect(digitoneRouting.locator('.channel-bank')).toBeVisible()
  await digitoneRouting.getByLabel('Close digitone MIDI setup').click()
  await expect(page.getByRole('button', { name: /PLAY/ })).toBeEnabled()

  const bassToneRoute = page.getByLabel('BASS Cutoff modulation source', { exact: true })
  await bassToneRoute.selectOption('lfo-1')
  const bassOctaveRoute = page.getByLabel('BASS Octave modulation source', { exact: true })
  await bassOctaveRoute.selectOption('lfo-1')
  await page.getByRole('button', { name: 'BASS octave depth up' }).click()
  const activeSelectorBoxes = await bassParameterSelectors.evaluateAll((selectors) => selectors.map((selector) => selector.getBoundingClientRect().toJSON()))
  expect(Math.max(...activeSelectorBoxes.map((box) => box.y)) - Math.min(...activeSelectorBoxes.map((box) => box.y))).toBeLessThan(1)
  const bassToneDepth = page.getByLabel('BASS Cutoff modulation source depth')
  expect((await bassToneDepth.boundingBox())?.width).toBeGreaterThan(45)
  await bassToneDepth.fill('31')
  await expect(bassToneDepth).toHaveValue('31')
  await page.getByLabel('BASS Cutoff modulation source baseline').fill('88')
  await bassToneDepth.fill('-24')
  await expect(bassToneDepth).toHaveValue('-24')
  const octaveCardBox = await page.locator('.lane').first().locator('.octave-macro').boundingBox()
  const octaveButtonBoxes = await page.locator('.lane').first().locator('.octave-macro button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON()))
  expect(Math.max(...octaveButtonBoxes.map((box) => box.x + box.width))).toBeLessThanOrEqual((octaveCardBox?.x ?? 0) + (octaveCardBox?.width ?? 0))
  await expect.poll(() => page.evaluate(() => (window as unknown as { __SIGNAL_RACK_LISTENERS__: (event: string) => number }).__SIGNAL_RACK_LISTENERS__('lfo-levels'))).toBe(1)
  await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_EMIT__: (event: string, payload: unknown) => void }).__SIGNAL_RACK_EMIT__('lfo-levels', { 'lfo-1': 0.5, 'lfo-2': 0, 'lfo-3': 0, 'lfo-4': 0 }))
  await expect(page.getByRole('meter', { name: 'LFO 1 current level' })).toHaveAttribute('aria-valuenow', '0.5')
  await expect(page.locator('.lane').first().locator('.macro output').first()).toHaveText('76 · 64–112')
  await expect(page.locator('.lane').first().locator('.octave-macro output')).toHaveText('+1 · -2–+2')
  await page.getByRole('button', { name: 'APPLY PHRASE', exact: true }).click()
  await expect(bassToneRoute).toHaveValue('lfo-1')
  await expect(page.getByLabel('T1 / BASS length')).toHaveValue('14')
  await expect(page.getByLabel('T2 / VAMP length')).toHaveValue('64')
  await expect(page.getByLabel('T3 / PUNCTURE length')).toHaveValue('14')
  await expect(page.getByLabel('T1 / KICK length')).toHaveValue('64')

  await expect(page.getByRole('heading', { name: 'SCENE MIXER' })).toBeVisible()
  const scenes = page.getByRole('region', { name: 'Club arrangement scenes' })
  await expect(scenes.getByRole('button')).toHaveCount(16)
  await expect(page.getByRole('button', { name: 'FULL' })).toBeVisible()
  await expect(scenes.locator('.scene-card')).toHaveText(['INTRO', 'GROOVE', 'BUILD', 'DROP', 'BREAK', 'RISE', 'PEAK', 'OUTRO'])
  await expect(page.getByRole('region', { name: 'Digitakt arrangement scenes' })).toHaveCount(0)
  await expect(page.getByText('ARRANGEMENT', { exact: true })).toHaveCount(0)
  await expect(scenes.locator('.scene-matrix')).toHaveCount(0)
  await scenes.getByRole('button', { name: 'BUILD', exact: true }).click()
  await expect(scenes.getByRole('button', { name: 'BUILD', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await scenes.getByRole('button', { name: 'Remove INTRO from auto loop' }).click()
  await expect(scenes.getByRole('button', { name: 'Add INTRO to auto loop' })).toHaveAttribute('aria-pressed', 'false')
  await scenes.getByRole('button', { name: 'Add INTRO to auto loop' }).click()
  await expect(page.getByLabel('Scene advance length')).toHaveValue('16')
  const sceneMeterCenters = await page.locator('.scene-impact-row').evaluateAll((meters) => meters.map((meter) => { const box = meter.getBoundingClientRect(); return box.x + box.width / 2 }))
  expect(sceneMeterCenters).toHaveLength(9)
  const sceneMeterGaps = sceneMeterCenters.slice(1).map((center, index) => center - sceneMeterCenters[index])
  expect(Math.max(...sceneMeterGaps) - Math.min(...sceneMeterGaps)).toBeLessThan(.1)

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
  const generation = calls.find((call) => call.command === 'generate_seed' && call.args?.variation === 1)
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
  expect(playedConfiguration?.args?.config).toMatchObject({ scene: 'space', digitaktScene: 'core' })
  expect(JSON.stringify(playedConfiguration?.args?.config)).toContain('"period":"bars-128"')
})

test('replaces one lane with a Euclidean cycle and carries nearby voicings onto its hits', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Euclidean target lane').selectOption('dn-vamp')
  await page.getByRole('button', { name: /TRESILLO: CUBAN/ }).click()
  await page.locator('.euclidean-module').getByRole('button', { name: 'APPLY EUCLIDEAN' }).click()

  await expect(page.getByLabel('T2 / VAMP length')).toHaveValue('8')
  await expect(page.getByLabel('T1 / BASS length')).toHaveValue('64')
  await expect(page.getByLabel('T1 / KICK length')).toHaveValue('64')

  const vamp = page.locator('.lane').filter({ hasText: 'T2 / VAMP' })
  await expect(vamp.getByLabel('Select T2 / VAMP step 1', { exact: true })).toContainText('D3 F3 A3 C4')
  await expect(vamp.getByLabel('Select T2 / VAMP step 2', { exact: true })).toContainText('REST')
  await expect(vamp.getByLabel('Select T2 / VAMP step 4', { exact: true })).toContainText('D3 F3 A3 C4')
  await expect(vamp.getByLabel('Select T2 / VAMP step 7', { exact: true })).toContainText('D3 F3 A3 C4')
  await expect(vamp.getByLabel('Select T2 / VAMP step 9', { exact: true })).toHaveClass(/outside-cycle/)
  const calls = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { config?: { tracks?: Array<{ id: string; length: number; steps: Array<{ notes: number[] }> }> } } }> }).__SIGNAL_RACK_CALLS__)
  const applied = [...calls].reverse().find((call) => call.command === 'configure')
  const track = applied?.args?.config?.tracks?.find((candidate) => candidate.id === 'dn-vamp')
  expect(track?.length).toBe(8)
  expect(track?.steps.slice(0, 8).map((step) => step.notes.length > 0)).toEqual([true, false, false, true, false, false, true, false])
})

test('applies a generated phrase only to the selected instrument subset', async ({ page }) => {
  await page.goto('/')

  const kickLength = page.getByLabel('T1 / KICK length')
  const originalKickLength = await kickLength.inputValue()
  await page.getByLabel('ROOT', { exact: true }).selectOption('6')
  await page.getByLabel('Arpeggio scale').selectOption('dorian')
  await page.getByLabel('Phrase target lane').selectOption('all-digitone')
  await page.getByRole('button', { name: 'APPLY PHRASE' }).click()

  await expect(page.getByLabel('T1 / BASS length')).toHaveValue('64')
  await expect(kickLength).toHaveValue(originalKickLength)
  await expect(page.getByLabel('Arpeggio root')).toHaveValue('6')
  await expect(page.getByLabel('Arpeggio scale')).toHaveValue('dorian')
})

test('moves tonal lanes from a latched mutation into a promoted base without changing performance data', async ({ page }) => {
  await page.goto('/')

  const mutation = page.getByLabel('Phrase mutation')
  const mutationTarget = page.getByLabel('Mutation target lane')
  const applyMutation = page.getByRole('button', { name: 'APPLY MUTATION' })
  await expect(mutation.locator('option')).toHaveCount(6)
  await expect(mutation.locator('option')).toHaveText(['FIFTH UP', 'FIFTH DOWN', 'BRIGHTER', 'DARKER', 'RELATIVE SHIFT', 'PARALLEL SHIFT'])
  await expect(mutationTarget.locator('option')).toHaveCount(7)
  await expect(page.getByText('READY TO MUTATE')).toBeVisible()
  await expect(applyMutation).toBeEnabled()
  await mutationTarget.selectOption('td3-acid')
  await applyMutation.click()
  await expect(mutation).toBeDisabled()
  await expect(page.getByText('1/4 TONAL LANES')).toBeVisible()

  const firstMutation = await page.evaluate(() => {
    const calls = (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { config?: { tracks?: Array<{ id: string; tone?: number; steps: Array<{ notes: number[]; velocity: number; gate: number; probability: number }> }> } } }> }).__SIGNAL_RACK_CALLS__
    return [...calls].reverse().find((call) => call.command === 'configure')?.args?.config?.tracks
  })
  expect(firstMutation?.find((track) => track.id === 'td3-acid')?.steps[0]).toEqual({ notes: [44], velocity: 127, gate: 54, probability: 100, accent: true, slide: false })
  expect(firstMutation?.find((track) => track.id === 'dn-vamp')?.steps[0].notes).toEqual([50, 53, 57, 60])
  expect(firstMutation?.find((track) => track.id === 'dn-vamp')?.tone).toBe(72)

  await mutationTarget.selectOption('dn-vamp')
  await applyMutation.click()
  await expect(page.getByText('2/4 TONAL LANES')).toBeVisible()
  const secondMutation = await page.evaluate(() => {
    const calls = (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { config?: { tracks?: Array<{ id: string; steps: Array<{ notes: number[] }> }> } } }> }).__SIGNAL_RACK_CALLS__
    return [...calls].reverse().find((call) => call.command === 'configure')?.args?.config?.tracks
  })
  expect(secondMutation?.find((track) => track.id === 'dn-vamp')?.steps[0].notes).toEqual([57, 60, 64, 67])

  await page.getByRole('button', { name: 'MAKE CURRENT BASE' }).click()
  await expect(mutation).toBeEnabled()
  await expect(page.getByLabel('ROOT', { exact: true })).toHaveValue('8')
  await expect(page.getByText('READY TO MUTATE')).toBeVisible()

  await mutationTarget.selectOption('td3-acid')
  await applyMutation.click()
  const promotedMutation = await page.evaluate(() => {
    const calls = (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { config?: { tracks?: Array<{ id: string; steps: Array<{ notes: number[] }> }> } } }> }).__SIGNAL_RACK_CALLS__
    return [...calls].reverse().find((call) => call.command === 'configure')?.args?.config?.tracks
  })
  expect(promotedMutation?.find((track) => track.id === 'td3-acid')?.steps[0].notes).toEqual([51])
})

test('keeps every harmonic mutation audible on a sparse acid lane and can return it to base', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('READY TO MUTATE')).toBeVisible()
  await page.getByLabel('Mutation target lane').selectOption('td3-acid')

  for (const value of ['brighter', 'darker', 'relative-shift', 'parallel-shift']) {
    await page.getByLabel('Phrase mutation').selectOption(value)
    await page.getByRole('button', { name: 'APPLY MUTATION' }).click()
    const acidNotes = await page.evaluate(() => {
      const calls = (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { config?: { tracks?: Array<{ id: string; steps: Array<{ notes: number[] }> }> } } }> }).__SIGNAL_RACK_CALLS__
      return [...calls].reverse().find((call) => call.command === 'configure')?.args?.config?.tracks?.find((track) => track.id === 'td3-acid')?.steps.map((step) => step.notes)
    })
    expect(acidNotes).not.toEqual(Array.from({ length: 64 }, (_, index) => {
      const local = index % 16
      return [0, 3, 6, 7, 10, 14].includes(local) ? [local === 7 ? 49 : 37 + (local % 5)] : []
    }))
    await page.getByRole('button', { name: 'RETURN MUTATED LANES' }).click()
    await expect(page.getByLabel('Phrase mutation')).toBeEnabled()
  }
})

test('generates and edits a monophonic TD-3 phrase with accent and slide articulation', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Phrase target lane').selectOption('all-td3')
  await page.getByRole('button', { name: 'APPLY PHRASE' }).click()

  const td3 = page.locator('.td3-module')
  await expect(td3.getByLabel('ACID LINE length')).toHaveValue('64')
  await expect(td3.getByLabel('Select ACID LINE step 1', { exact: true })).toContainText('A ·')
  await expect(td3.getByLabel('Select ACID LINE step 7', { exact: true })).toContainText('· S')
  await td3.getByLabel('Select ACID LINE step 7', { exact: true }).click()
  await expect(page.locator('.acid-step-editor h2')).toHaveText('ACID · STEP 07')
  await expect(page.getByLabel('TD-3 slide to next step')).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('TD-3 accent').click()
  await expect(page.getByLabel('TD-3 accent')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /PLAY/ }).click()
  await page.getByRole('button', { name: /STOP/ }).click()

  const calls = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { config?: { tracks?: Array<{ id: string; steps: Array<{ notes: number[]; accent?: boolean; slide?: boolean }> }> } } }> }).__SIGNAL_RACK_CALLS__)
  const configured = [...calls].reverse().find((call) => call.command === 'configure')
  const acid = configured?.args?.config?.tracks?.find((track) => track.id === 'td3-acid')
  expect(acid?.steps[6]).toMatchObject({ notes: [38], accent: true, slide: true })
  expect(acid?.steps.every((step) => step.notes.length <= 1)).toBe(true)
})

test('seeds the Digitone arpeggiator from the phrase and can create an alternating trigger lane', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'APPLY PHRASE', exact: true }).click()

  for (const note of ['C♯', 'D♯', 'E', 'F♯', 'G♯', 'A', 'B']) await expect(page.getByLabel(`Arpeggio note ${note}`, { exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Arpeggio note C', { exact: true })).toHaveAttribute('aria-pressed', 'false')
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
  expect(puncture?.steps.slice(0, 8).map((step) => step.notes)).toEqual([[71], [], [71], [], [69], [], [69], []])
})

test('keeps rapid generation requests distinct and applies the newest response', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    ;(window as unknown as { __SIGNAL_RACK_GENERATION_DELAYS__: Record<number, number> }).__SIGNAL_RACK_GENERATION_DELAYS__ = { 1: 80, 2: 5 }
  })

  const generate = page.getByRole('button', { name: 'APPLY PHRASE', exact: true })
  await generate.dblclick()

  await expect(page.locator('.seed-result > strong')).toContainText('VAR 2')
  await expect(generate).toHaveAttribute('aria-busy', 'false')

  const variations = await page.evaluate(() => (window as unknown as { __SIGNAL_RACK_CALLS__: Array<{ command: string; args?: { variation?: number } }> }).__SIGNAL_RACK_CALLS__
    .filter((call) => call.command === 'generate_seed')
    .map((call) => call.args?.variation))
  expect(variations).toEqual([0, 1, 2])
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

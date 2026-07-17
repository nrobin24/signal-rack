import { useEffect, useRef, useState } from 'react'
import type { DigitaktSceneId, DigitaktTrackId, DigitoneTrackId, GeneratorTarget, Groove, LfoConfig, LfoId, LfoPeriod, LfoPoint, LfoShape, RackTarget, SceneId, SequencerConfig, Step, Td3TrackId, TrackConfig, TrackId } from '../../shared/types'
import { backend } from './backend'
import GeneratorLab, { type LabCandidate, type LabCycleMode } from './GeneratorLab'
import {
  bassRoleLabels,
  harmonyLabels,
  phraseLeaderLabels,
  phraseShapeLabels,
  rhythmLabels,
  rootLabels,
  type BassRole,
  type CycleMode,
  type Energy,
  type HarmonyColor,
  type PhraseLeader,
  type PhraseShape,
  type RhythmConcept,
  type SeedSettings
} from './seed'
import { lfoPeriodLabels } from './modulation'
import { euclideanPattern, euclideanPresets, replaceWithEuclideanSteps, type EuclideanSettings } from './euclidean'
import { applyArpeggio as applyArpeggioToSteps, pitchClassLabels, type ArpeggioDirection, type ArpeggioSettings, type ArpeggioTriggers } from './arpeggio'

type Color = 'orange' | 'cyan' | 'violet' | 'lime' | 'rose' | 'blue' | 'teal' | 'amber' | 'pink' | 'sand'
type DigitoneTrack = TrackConfig & {
  id: DigitoneTrackId
  target: 'digitone'
  label: string
  shortLabel: string
  color: Color
  octave: number
  tone: number
  space: number
}
type DigitaktTrack = TrackConfig & {
  id: DigitaktTrackId
  target: 'digitakt'
  label: string
  shortLabel: string
  color: Color
  tone: number
  space: number
}
type Td3Track = TrackConfig & {
  id: Td3TrackId
  target: 'td3'
  label: string
  shortLabel: string
  color: Color
  octave: number
}
type MacroSource = 'off' | 'manual' | LfoId
type SelectedStep = { trackId: DigitoneTrackId; index: number | null }
type SelectedDrumStep = { trackId: DigitaktTrackId; index: number | null }
type SelectedAcidStep = { trackId: Td3TrackId; index: number | null }
type OutputSelection = Record<RackTarget, number | null>
type SequenceView = 'detail' | 'overview'
type AppMode = 'rack' | 'generator-lab'
type SceneSequenceId = 'intro' | 'groove' | 'build' | 'drop' | 'break' | 'rise' | 'peak' | 'outro'
type UnifiedSceneId = 'full' | SceneSequenceId
type SceneBarLength = 4 | 8 | 16 | 32 | 64
type ArpeggioScale = 'minor' | 'dorian' | 'phrygian' | 'major' | 'mixolydian' | 'chromatic'

const stepCount = 64
const pageSize = 16
const pageCount = stepCount / pageSize
const sequenceLengths = [8, 10, 12, 14, 16, 24, 32, 48, 64]
const euclideanFallbackNotes: Record<TrackId, number[]> = {
  'dn-bass': [37],
  'dn-vamp': [52, 59, 63],
  'dn-puncture': [73],
  'td3-acid': [37],
  'dk-kick': [60],
  'dk-snare': [60],
  'dk-closed-hat': [60],
  'dk-open-hat': [60],
  'dk-rim': [60],
  'dk-clap': [60],
  'dk-texture': [60]
}
const normalizeSteps = (steps: Step[]): Step[] => Array.from({ length: stepCount }, (_, index) => steps[index] ?? { notes: [], velocity: 100, gate: 50, probability: 100 })
const defaultSteps = (notes: Array<number[] | null>, velocity = 100, gate = 66, probability = 100): Step[] =>
  normalizeSteps(notes.map((step) => ({ notes: step ?? [], velocity, gate, probability })))

const initialDigitoneTracks: DigitoneTrack[] = [
  {
    id: 'dn-bass', target: 'digitone', label: 'T1 / BASS', shortLabel: 'BASS', color: 'orange', channel: 1, octave: 0, length: 14,
    groove: 'straight', muted: false, tone: 62, space: 18,
    steps: defaultSteps([[37], null, [37], null, [40], null, [35], null, [37], null, [44], null, [35], null, [40], null], 106, 58)
  },
  {
    id: 'dn-vamp', target: 'digitone', label: 'T2 / VAMP', shortLabel: 'VAMP', color: 'cyan', channel: 2, octave: 0, length: 16,
    groove: 'late', muted: false, tone: 74, space: 62,
    steps: defaultSteps([null, null, [52, 59, 63], null, null, [59, 64, 66], null, null, null, null, null, [52, 59, 63], null, [58, 63, 68], null, null], 84, 42)
  },
  {
    id: 'dn-puncture', target: 'digitone', label: 'T3 / PUNCTURE', shortLabel: 'PUNCTURE', color: 'violet', channel: 3, octave: 0, length: 12,
    groove: 'broken', muted: false, tone: 96, space: 41,
    steps: defaultSteps([[73], null, null, [80], null, [76], null, null, [73], null, [85], null, null, null, [76], null], 78, 26, 68)
  }
]

const initialDigitaktTracks: DigitaktTrack[] = [
  drumTrack('dk-kick', 'T1 / KICK', 'lime', 1, [0, 3, 7, 10], 118, 'straight'),
  drumTrack('dk-snare', 'T2 / SNARE', 'rose', 2, [4, 11], 108, 'late'),
  drumTrack('dk-closed-hat', 'T3 / CLOSED HAT', 'blue', 3, [2, 5, 6, 9, 13, 15], 84, 'broken'),
  drumTrack('dk-open-hat', 'T4 / OPEN HAT', 'teal', 4, [6, 14], 90, 'late'),
  drumTrack('dk-rim', 'T5 / RIMSHOT', 'amber', 5, [3, 10], 92, 'push'),
  drumTrack('dk-clap', 'T6 / CLAP', 'pink', 6, [4, 12], 102, 'late'),
  drumTrack('dk-texture', 'T7 / TEXTURE', 'sand', 7, [7, 14], 76, 'broken')
]

const initialTd3Tracks: Td3Track[] = [{
  id: 'td3-acid', target: 'td3', label: 'ACID LINE', shortLabel: 'ACID', color: 'pink', channel: 1, octave: 0, length: 16,
  groove: 'straight', muted: false,
  steps: defaultSteps([[37], null, null, [44], null, [40], [41], null, null, null, [37], [49], null, null, [47], [44]], 92, 54)
}]

const defaultDrawnPoints: LfoPoint[] = [
  { x: 0, y: 0 },
  { x: 0.25, y: 1 },
  { x: 0.5, y: 0 },
  { x: 0.75, y: -1 },
  { x: 1, y: 0 }
]

const initialLfos: LfoConfig[] = [
  { id: 'lfo-1', shape: 'triangle', period: 'bars-4' },
  { id: 'lfo-2', shape: 'sine', period: 'bars-16' },
  { id: 'lfo-3', shape: 'drawn', period: 'bars-4', points: [{ x: 0, y: -0.25 }, { x: 0.125, y: 0.8 }, { x: 0.3125, y: -0.55 }, { x: 0.5, y: 0.2 }, { x: 0.6875, y: 1 }, { x: 0.875, y: -0.7 }, { x: 1, y: -0.25 }] },
  { id: 'lfo-4', shape: 'drawn', period: 'bars-4', points: [{ x: 0, y: 0.6 }, { x: 0.1875, y: -0.9 }, { x: 0.375, y: -0.2 }, { x: 0.5625, y: 0.85 }, { x: 0.75, y: 0.15 }, { x: 0.9375, y: -0.65 }, { x: 1, y: 0.6 }] }
]

const lfoIds: LfoId[] = ['lfo-1', 'lfo-2', 'lfo-3', 'lfo-4']
const zeroLfoLevels: Record<LfoId, number> = { 'lfo-1': 0, 'lfo-2': 0, 'lfo-3': 0, 'lfo-4': 0, 'lfo-5': 0, 'lfo-6': 0, 'lfo-7': 0, 'lfo-8': 0 }

const lfoShapeLabels: Record<LfoShape, string> = {
  sine: 'SINE', triangle: 'TRIANGLE', square: 'SQUARE', 'ramp-up': 'RAMP UP', 'ramp-down': 'RAMP DOWN', random: 'SAMPLE + HOLD', drawn: 'DRAWN'
}

const unifiedSceneInfo: Record<UnifiedSceneId, { label: string; digitone: SceneId; digitakt: DigitaktSceneId }> = {
  full: { label: 'FULL', digitone: 'full', digitakt: 'full' },
  intro: { label: 'INTRO', digitone: 'drop', digitakt: 'drop' },
  groove: { label: 'GROOVE', digitone: 'bass', digitakt: 'core' },
  build: { label: 'BUILD', digitone: 'space', digitakt: 'core' },
  drop: { label: 'DROP', digitone: 'full', digitakt: 'full' },
  break: { label: 'BREAK', digitone: 'space', digitakt: 'drop' },
  rise: { label: 'RISE', digitone: 'bass', digitakt: 'tops' },
  peak: { label: 'PEAK', digitone: 'full', digitakt: 'tops' },
  outro: { label: 'OUTRO', digitone: 'bass', digitakt: 'drop' }
}
const sceneSequence: SceneSequenceId[] = ['intro', 'groove', 'build', 'drop', 'break', 'rise', 'peak', 'outro']
const initialSceneEnabled: Record<SceneSequenceId, boolean> = { intro: true, groove: true, build: true, drop: true, break: true, rise: true, peak: true, outro: true }

type SceneImpactGroup = { label: string; parts: Array<{ label: string; level: number }> }
const digitoneImpact: Record<SceneId, SceneImpactGroup> = {
  full: { label: 'DIGITONE', parts: [{ label: 'BASS', level: 1 }, { label: 'VAMP', level: 1 }, { label: 'PUNCTURE', level: 1 }] },
  bass: { label: 'DIGITONE', parts: [{ label: 'BASS', level: 1 }, { label: 'VAMP', level: 0 }, { label: 'PUNCTURE', level: .25 }] },
  space: { label: 'DIGITONE', parts: [{ label: 'BASS', level: .55 }, { label: 'VAMP', level: 1 }, { label: 'PUNCTURE', level: .4 }] },
  drop: { label: 'DIGITONE', parts: [{ label: 'BASS', level: 0 }, { label: 'VAMP', level: 0 }, { label: 'PUNCTURE', level: .2 }] }
}
const digitaktImpact: Record<DigitaktSceneId, SceneImpactGroup> = {
  full: { label: 'DIGITAKT', parts: [{ label: 'KICK', level: 1 }, { label: 'SNARE', level: 1 }, { label: 'HATS', level: 1 }, { label: 'RIM', level: 1 }, { label: 'CLAP', level: 1 }, { label: 'TEXTURE', level: 1 }] },
  core: { label: 'DIGITAKT', parts: [{ label: 'KICK', level: 1 }, { label: 'SNARE', level: 1 }, { label: 'HATS', level: .35 }, { label: 'RIM', level: .35 }, { label: 'CLAP', level: .8 }, { label: 'TEXTURE', level: 0 }] },
  tops: { label: 'DIGITAKT', parts: [{ label: 'KICK', level: .3 }, { label: 'SNARE', level: .55 }, { label: 'HATS', level: 1 }, { label: 'RIM', level: .75 }, { label: 'CLAP', level: .55 }, { label: 'TEXTURE', level: .8 }] },
  drop: { label: 'DIGITAKT', parts: [{ label: 'KICK', level: .2 }, { label: 'SNARE', level: 0 }, { label: 'HATS', level: 0 }, { label: 'RIM', level: 0 }, { label: 'CLAP', level: 0 }, { label: 'TEXTURE', level: .35 }] }
}
const sceneImpact = (id: UnifiedSceneId): SceneImpactGroup[] => [digitoneImpact[unifiedSceneInfo[id].digitone], digitaktImpact[unifiedSceneInfo[id].digitakt]]

export default function App(): React.JSX.Element {
  const [mode, setMode] = useState<AppMode>('rack')
  const [bpm, setBpm] = useState(132)
  const [outputs, setOutputs] = useState<string[]>([])
  const [selectedOutputs, setSelectedOutputs] = useState<OutputSelection>({ digitone: null, digitakt: null, td3: null })
  const [playing, setPlaying] = useState(false)
  const [currentSteps, setCurrentSteps] = useState<Partial<Record<TrackId, number>>>({})
  const [lfoLevels, setLfoLevels] = useState<Record<LfoId, number>>(zeroLfoLevels)
  const [digitoneTracks, setDigitoneTracks] = useState<DigitoneTrack[]>(initialDigitoneTracks)
  const [digitaktTracks, setDigitaktTracks] = useState<DigitaktTrack[]>(initialDigitaktTracks)
  const [td3Tracks, setTd3Tracks] = useState<Td3Track[]>(initialTd3Tracks)
  const [instrumentMutes, setInstrumentMutes] = useState<Record<RackTarget, boolean>>({ digitone: false, digitakt: false, td3: false })
  const [lfos, setLfos] = useState<LfoConfig[]>(initialLfos)
  const [activeScene, setActiveScene] = useState<UnifiedSceneId>('full')
  const [sceneEnabled, setSceneEnabled] = useState<Record<SceneSequenceId, boolean>>(initialSceneEnabled)
  const [sceneAutoAdvance, setSceneAutoAdvance] = useState(false)
  const [sceneBars, setSceneBars] = useState<SceneBarLength>(16)
  const scene = unifiedSceneInfo[activeScene].digitone
  const digitaktScene = unifiedSceneInfo[activeScene].digitakt
  const [selectedStep, setSelectedStep] = useState<SelectedStep>({ trackId: 'dn-bass', index: null })
  const [selectedDrumStep, setSelectedDrumStep] = useState<SelectedDrumStep>({ trackId: 'dk-kick', index: null })
  const [selectedAcidStep, setSelectedAcidStep] = useState<SelectedAcidStep>({ trackId: 'td3-acid', index: null })
  const [digitoneView, setDigitoneView] = useState<SequenceView>('detail')
  const [digitonePage, setDigitonePage] = useState(0)
  const [digitaktView, setDigitaktView] = useState<SequenceView>('detail')
  const [digitaktPage, setDigitaktPage] = useState(0)
  const [td3View, setTd3View] = useState<SequenceView>('detail')
  const [td3Page, setTd3Page] = useState(0)
  const [seedSettings, setSeedSettings] = useState<SeedSettings>({ root: 1, harmony: 'house', bassRole: 'answer', rhythm: 'house', energy: 'medium', shape: 'aa-turn', leader: 'bass', cycleMode: 'auto' })
  const [lastSeed, setLastSeed] = useState('No generated phrase yet')
  const [seedBusy, setSeedBusy] = useState(false)
  const [arpeggioRootSync, setArpeggioRootSync] = useState({ root: seedSettings.root, revision: 0 })
  const [playingCandidateId, setPlayingCandidateId] = useState<string | null>(null)
  const [labHasUnexportedSession, setLabHasUnexportedSession] = useState(false)
  const seedVariation = useRef(0)
  const latestSeedRequest = useRef(0)
  const labStopTimer = useRef<number | null>(null)
  const sceneAutomationRef = useRef({ enabled: sceneAutoAdvance, bars: sceneBars, scenes: sceneEnabled, active: activeScene })
  const chooseSceneRef = useRef<(scene: UnifiedSceneId) => void>(() => {})
  sceneAutomationRef.current = { enabled: sceneAutoAdvance, bars: sceneBars, scenes: sceneEnabled, active: activeScene }

  useEffect(() => {
    let disposed = false
    let unsubscribeStep: (() => void) | undefined
    let unsubscribeLfo: (() => void) | undefined
    let unsubscribeStop: (() => void) | undefined
    let unsubscribeClock: (() => void) | undefined
    void Promise.all([backend.listOutputs(), backend.getStatus(), backend.onStep((steps) => setCurrentSteps(steps)), backend.onLfoLevels((levels) => setLfoLevels((current) => ({ ...current, ...levels }))), backend.onClockStep((globalStep) => { const automation = sceneAutomationRef.current; if (!automation.enabled || globalStep === 0 || globalStep % (automation.bars * 16) !== 0) return; const enabledScenes = sceneSequence.filter((id) => automation.scenes[id]); if (!enabledScenes.length) return; const currentIndex = enabledScenes.indexOf(automation.active as SceneSequenceId); chooseSceneRef.current(enabledScenes[(currentIndex + 1) % enabledScenes.length]) }), backend.onStopped(() => { if (labStopTimer.current !== null) { window.clearTimeout(labStopTimer.current); labStopTimer.current = null } setPlaying(false); setPlayingCandidateId(null); setCurrentSteps({}); setLfoLevels({ ...zeroLfoLevels }) })]).then(([nextOutputs, status, nextUnsubscribeStep, nextUnsubscribeLfo, nextUnsubscribeClock, nextUnsubscribeStop]) => {
      if (disposed) { nextUnsubscribeStep(); nextUnsubscribeLfo(); nextUnsubscribeClock(); nextUnsubscribeStop(); return }
      unsubscribeStep = nextUnsubscribeStep
      unsubscribeLfo = nextUnsubscribeLfo
      unsubscribeClock = nextUnsubscribeClock
      unsubscribeStop = nextUnsubscribeStop
      setOutputs(nextOutputs)
      setSelectedOutputs({
        digitone: status.outputNames.digitone === null ? null : nextOutputs.indexOf(status.outputNames.digitone),
        digitakt: status.outputNames.digitakt === null ? null : nextOutputs.indexOf(status.outputNames.digitakt),
        td3: status.outputNames.td3 === null ? null : nextOutputs.indexOf(status.outputNames.td3)
      })
      setPlaying(status.playing)
    }).catch(console.error)
    return () => { disposed = true; if (labStopTimer.current !== null) window.clearTimeout(labStopTimer.current); unsubscribeStep?.(); unsubscribeLfo?.(); unsubscribeClock?.(); unsubscribeStop?.() }
  }, [])

  function config(nextDigitone = digitoneTracks, nextDigitakt = digitaktTracks, nextScene = scene, nextBpm = bpm, nextLfos = lfos, nextInstrumentMutes = instrumentMutes, nextDigitaktScene = digitaktScene, nextTd3 = td3Tracks): SequencerConfig {
    const digitoneConfig: TrackConfig[] = nextDigitone.map(({ id, channel, octave, length, groove, muted, tone, space, toneEnabled, spaceEnabled, toneLfo, spaceLfo, octaveLfo, toneLfoDepth, spaceLfoDepth, octaveLfoDepth, steps }) => ({
      id, target: 'digitone', channel, length, groove, muted: muted || nextInstrumentMutes.digitone, tone, space, toneEnabled, spaceEnabled, toneLfo, spaceLfo, octaveLfo, toneLfoDepth, spaceLfoDepth, octaveLfoDepth,
      steps: steps.map((step) => ({ ...step, notes: step.notes.map((note) => clampNote(note + octave * 12)) }))
    }))
    const digitaktConfig: TrackConfig[] = nextDigitakt.map(({ id, channel, length, groove, muted, tone, space, toneEnabled, spaceEnabled, toneLfo, spaceLfo, toneLfoDepth, spaceLfoDepth, steps }) => ({
      id, target: 'digitakt', channel, length, groove, muted: muted || nextInstrumentMutes.digitakt, tone, space, toneEnabled, spaceEnabled, toneLfo, spaceLfo, toneLfoDepth, spaceLfoDepth, steps
    }))
    const td3Config: TrackConfig[] = nextTd3.map(({ id, channel, octave, length, groove, muted, steps }) => ({
      id, target: 'td3', channel, length, groove, muted: muted || nextInstrumentMutes.td3,
      steps: steps.map((step) => ({ ...step, notes: step.notes.slice(0, 1).map((note) => clampNote(note + octave * 12)) }))
    }))
    return { bpm: nextBpm, scene: nextScene, digitaktScene: nextDigitaktScene, lfos: nextLfos, tracks: [...digitoneConfig, ...digitaktConfig, ...td3Config] }
  }

  async function selectModuleOutput(target: RackTarget, port: number | null): Promise<void> {
    await backend.selectOutput(target, port)
    setSelectedOutputs((current) => ({ ...current, [target]: port }))
    if (port !== null) await backend.configure(config())
  }

  async function refreshOutputs(): Promise<void> {
    const [nextOutputs, status] = await Promise.all([backend.listOutputs(), backend.getStatus()])
    const nextSelection: OutputSelection = { digitone: null, digitakt: null, td3: null }
    for (const target of ['digitone', 'digitakt', 'td3'] as RackTarget[]) {
      const priorName = status.outputNames[target] ?? (selectedOutputs[target] === null ? null : outputs[selectedOutputs[target]])
      const nextPort = priorName === null ? null : nextOutputs.indexOf(priorName)
      nextSelection[target] = nextPort === -1 ? null : nextPort
      await backend.selectOutput(target, nextSelection[target])
    }
    setOutputs(nextOutputs)
    setSelectedOutputs(nextSelection)
    setPlaying(status.playing)
  }

  async function startTransport(): Promise<void> {
    if (selectedOutputs.digitone === null && selectedOutputs.digitakt === null && selectedOutputs.td3 === null) return
    await backend.configure(config())
    await backend.start()
    setPlaying(true)
  }

  async function stopTransport(): Promise<void> {
    if (labStopTimer.current !== null) {
      window.clearTimeout(labStopTimer.current)
      labStopTimer.current = null
    }
    await backend.stop()
    setPlaying(false)
    setPlayingCandidateId(null)
    setCurrentSteps({})
  }

  function updateBpm(nextBpm: number): void {
    const safeBpm = Math.max(60, Math.min(220, nextBpm || 60))
    setBpm(safeBpm)
    if (playing) void backend.configure(config(digitoneTracks, digitaktTracks, scene, safeBpm))
  }

  function updateDigitoneTrack(trackId: DigitoneTrackId, change: (track: DigitoneTrack) => DigitoneTrack): void {
    setDigitoneTracks((current) => {
      const next = current.map((track) => track.id === trackId ? change(track) : track)
      if (playing) void backend.configure(config(next))
      return next
    })
  }

  function updateDigitaktTrack(trackId: DigitaktTrackId, change: (track: DigitaktTrack) => DigitaktTrack): void {
    setDigitaktTracks((current) => {
      const next = current.map((track) => track.id === trackId ? change(track) : track)
      if (playing) void backend.configure(config(digitoneTracks, next))
      return next
    })
  }

  function updateTd3Track(trackId: Td3TrackId, change: (track: Td3Track) => Td3Track): void {
    setTd3Tracks((current) => {
      const next = current.map((track) => track.id === trackId ? change(track) : track)
      if (playing) void backend.configure(config(digitoneTracks, digitaktTracks, scene, bpm, lfos, instrumentMutes, digitaktScene, next))
      return next
    })
  }

  function chooseScene(nextScene: UnifiedSceneId): void {
    const preset = unifiedSceneInfo[nextScene]
    setActiveScene(nextScene)
    if (playing) void backend.configure(config(digitoneTracks, digitaktTracks, preset.digitone, bpm, lfos, instrumentMutes, preset.digitakt))
  }
  chooseSceneRef.current = chooseScene

  function changeMacro(trackId: TrackId, macro: 'tone' | 'space', value: number): void {
    const current = [...digitoneTracks, ...digitaktTracks].find((track) => track.id === trackId)
    if (!current) return
    const nextTrack = { ...current, [macro]: value }
    const nextDigitone = digitoneTracks.map((track) => track.id === trackId ? nextTrack as DigitoneTrack : track)
    const nextDigitakt = digitaktTracks.map((track) => track.id === trackId ? nextTrack as DigitaktTrack : track)
    setDigitoneTracks(nextDigitone)
    setDigitaktTracks(nextDigitakt)
    void backend.configure(config(nextDigitone, nextDigitakt))
    void backend.setMacros(trackId, nextTrack.tone, nextTrack.space)
  }

  function changeMacroRoute(trackId: TrackId, macro: 'tone' | 'space', source: MacroSource): void {
    const current = [...digitoneTracks, ...digitaktTracks].find((track) => track.id === trackId)
    if (!current) return
    const routeKey = macro === 'tone' ? 'toneLfo' : 'spaceLfo'
    const depthKey = macro === 'tone' ? 'toneLfoDepth' : 'spaceLfoDepth'
    const enabledKey = macro === 'tone' ? 'toneEnabled' : 'spaceEnabled'
    const nextTrack = { ...current, [enabledKey]: source !== 'off', [routeKey]: source === 'off' || source === 'manual' ? undefined : source, [depthKey]: current[depthKey] ?? 18 }
    const nextDigitone = digitoneTracks.map((track) => track.id === trackId ? nextTrack as DigitoneTrack : track)
    const nextDigitakt = digitaktTracks.map((track) => track.id === trackId ? nextTrack as DigitaktTrack : track)
    setDigitoneTracks(nextDigitone)
    setDigitaktTracks(nextDigitakt)
    void backend.configure(config(nextDigitone, nextDigitakt)).then(() => {
      if (source !== 'off') return backend.setMacros(trackId, nextTrack.tone, nextTrack.space)
    })
  }

  function changeMacroDepth(trackId: TrackId, macro: 'tone' | 'space', depth: number): void {
    const depthKey = macro === 'tone' ? 'toneLfoDepth' : 'spaceLfoDepth'
    if (trackId.startsWith('dn-')) updateDigitoneTrack(trackId as DigitoneTrackId, (track) => ({ ...track, [depthKey]: depth }))
    else if (trackId.startsWith('dk-')) updateDigitaktTrack(trackId as DigitaktTrackId, (track) => ({ ...track, [depthKey]: depth }))
  }

  function toggleInstrumentMute(target: RackTarget): void {
    const next = { ...instrumentMutes, [target]: !instrumentMutes[target] }
    setInstrumentMutes(next)
    void backend.configure(config(digitoneTracks, digitaktTracks, scene, bpm, lfos, next))
  }

  function updateLfo(id: LfoId, change: (lfo: LfoConfig) => LfoConfig): void {
    setLfos((current) => {
      const next = current.map((lfo) => lfo.id === id ? change(lfo) : lfo)
      void backend.configure(config(digitoneTracks, digitaktTracks, scene, bpm, next))
      return next
    })
  }

  async function seedRack(target: GeneratorTarget): Promise<void> {
    const variation = seedVariation.current + 1
    seedVariation.current = variation
    const request = latestSeedRequest.current + 1
    latestSeedRequest.current = request
    setSeedBusy(true)

    try {
      const generated = await backend.generateSeed(seedSettings, variation)
      if (request !== latestSeedRequest.current) return

      await applyGeneratedSeed(generated, target)
      setArpeggioRootSync((current) => ({ root: seedSettings.root, revision: current.revision + 1 }))
      setLastSeed(generated.summary)
    } catch (error: unknown) {
      console.error(error)
      if (request === latestSeedRequest.current) setLastSeed(`GENERATOR ERROR · ${errorMessage(error)}`)
    } finally {
      if (request === latestSeedRequest.current) setSeedBusy(false)
    }
  }

  function applyEuclidean(settings: EuclideanSettings): void {
    const steps = Math.max(2, Math.min(stepCount, Math.round(settings.steps)))
    const hits = Math.max(1, Math.min(steps, Math.round(settings.hits)))
    const rotation = ((Math.round(settings.rotation) % steps) + steps) % steps
    const replace = <Track extends DigitoneTrack | DigitaktTrack | Td3Track>(track: Track): Track => ({
      ...track,
      length: steps,
      steps: replaceWithEuclideanSteps(track.steps, { hits, steps, rotation }, euclideanFallbackNotes[track.id])
    })
    const nextDigitone = digitoneTracks.map((track) => targetIncludes(settings.trackId, track.id) ? replace(track) : track)
    const nextDigitakt = digitaktTracks.map((track) => targetIncludes(settings.trackId, track.id) ? replace(track) : track)
    const nextTd3 = td3Tracks.map((track) => targetIncludes(settings.trackId, track.id) ? replace(track) : track)

    setDigitoneTracks(nextDigitone)
    setDigitaktTracks(nextDigitakt)
    setTd3Tracks(nextTd3)
    void backend.configure(config(nextDigitone, nextDigitakt, scene, bpm, lfos, instrumentMutes, digitaktScene, nextTd3))
  }

  function applyArpeggio(settings: ArpeggioSettings): void {
    const nextDigitone = digitoneTracks.map((track) => targetIncludes(settings.trackId, track.id)
      ? { ...track, steps: applyArpeggioToSteps(track.steps, track.length, settings) }
      : track)
    const nextDigitakt = digitaktTracks.map((track) => targetIncludes(settings.trackId, track.id)
      ? { ...track, steps: applyArpeggioToSteps(track.steps, track.length, settings) }
      : track)
    const nextTd3 = td3Tracks.map((track) => targetIncludes(settings.trackId, track.id)
      ? { ...track, steps: applyArpeggioToSteps(track.steps, track.length, settings).map((step) => ({ ...step, notes: step.notes.slice(0, 1), accent: false, slide: false })) }
      : track)
    setDigitoneTracks(nextDigitone)
    setDigitaktTracks(nextDigitakt)
    setTd3Tracks(nextTd3)
    void backend.configure(config(nextDigitone, nextDigitakt, scene, bpm, lfos, instrumentMutes, digitaktScene, nextTd3))
  }

  async function applyGeneratedSeed(generated: Awaited<ReturnType<typeof backend.generateSeed>>, target: GeneratorTarget = 'all'): Promise<{ nextDigitone: DigitoneTrack[]; nextDigitakt: DigitaktTrack[]; nextTd3: Td3Track[] }> {
    const generatedById = new Map(generated.tracks.map((track) => [track.id, track]))
    const nextDigitone = digitoneTracks.map((track) => {
      const next = generatedById.get(track.id)
      return next && targetIncludes(target, track.id) ? { ...track, length: next.length, groove: next.groove, steps: normalizeSteps(next.steps), tone: next.tone ?? track.tone, space: next.space ?? track.space } : track
    })
    const nextDigitakt = digitaktTracks.map((track) => {
      const next = generatedById.get(track.id)
      return next && targetIncludes(target, track.id) ? { ...track, length: next.length, groove: next.groove, steps: normalizeSteps(next.steps) } : track
    })
    const nextTd3 = td3Tracks.map((track) => {
      const next = generatedById.get(track.id)
      return next && targetIncludes(target, track.id) ? { ...track, length: next.length, groove: next.groove, steps: normalizeSteps(next.steps) } : track
    })
    setDigitoneTracks(nextDigitone)
    setDigitaktTracks(nextDigitakt)
    setTd3Tracks(nextTd3)
    await backend.configure(config(nextDigitone, nextDigitakt, scene, bpm, lfos, instrumentMutes, digitaktScene, nextTd3))
    await Promise.all([...nextDigitone, ...nextDigitakt].filter((track) => targetIncludes(target, track.id)).map((track) => backend.setMacros(track.id, track.tone, track.space)))
    return { nextDigitone, nextDigitakt, nextTd3 }
  }

  async function generateLabBatch(settings: SeedSettings, count: number): Promise<Array<{ variation: number; generated: Awaited<ReturnType<typeof backend.generateSeed>> }>> {
    const requests = Array.from({ length: count }, () => {
      seedVariation.current += 1
      const variation = seedVariation.current
      return backend.generateSeed(settings, variation).then((generated) => ({ variation, generated }))
    })
    return Promise.all(requests)
  }

  async function auditionLabCandidate(candidate: LabCandidate, cycles: LabCycleMode): Promise<void> {
    if (selectedOutputs.digitone === null && selectedOutputs.digitakt === null && selectedOutputs.td3 === null) return
    if (labStopTimer.current !== null) window.clearTimeout(labStopTimer.current)
    if (playing) await backend.stop()
    await applyGeneratedSeed(candidate.generated)
    await backend.start()
    setPlaying(true)
    setPlayingCandidateId(candidate.id)
    if (cycles !== 'loop') {
      const duration = Math.ceil((60_000 / bpm) * 16 * cycles)
      labStopTimer.current = window.setTimeout(() => { void stopTransport() }, duration)
    }
  }

  function exitGeneratorLab(discardConfirmed = false): void {
    if (labHasUnexportedSession && !discardConfirmed && !window.confirm('This Generator Lab session has not been exported since its latest changes. Leaving now will permanently discard the frozen batch and its evaluations.\n\nChoose Cancel, then use Export Session before leaving.')) return
    if (playingCandidateId !== null) void stopTransport()
    setMode('rack')
  }

  function enterGeneratorLab(): void {
    if (playing) void stopTransport()
    setMode('generator-lab')
  }

  const selectedTrack = digitoneTracks.find((track) => track.id === selectedStep.trackId) ?? digitoneTracks[0]
  const selectedIndex = selectedStep.index
  const selected = selectedIndex === null ? null : selectedTrack.steps[selectedIndex]
  const selectedDrumTrack = digitaktTracks.find((track) => track.id === selectedDrumStep.trackId) ?? digitaktTracks[0]
  const selectedDrumIndex = selectedDrumStep.index
  const selectedDrum = selectedDrumIndex === null ? null : selectedDrumTrack.steps[selectedDrumIndex]
  const selectedAcidTrack = td3Tracks.find((track) => track.id === selectedAcidStep.trackId) ?? td3Tracks[0]
  const selectedAcidIndex = selectedAcidStep.index
  const selectedAcid = selectedAcidIndex === null ? null : selectedAcidTrack.steps[selectedAcidIndex]
  const armedCount = Number(selectedOutputs.digitone !== null) + Number(selectedOutputs.digitakt !== null) + Number(selectedOutputs.td3 !== null)

  return <main className="app-shell">
    <header className="transport">
      <div className="brand"><span className={`lamp ${playing ? 'running' : ''}`} /> SIGNAL RACK {mode === 'generator-lab' && <small>GENERATOR LAB</small>}</div>
      <div className="transport-controls">
        <label>BPM<input aria-label="BPM" type="number" min="60" max="220" value={bpm} onChange={(event) => updateBpm(Number(event.target.value))} /></label>
        <button className="play" onClick={startTransport} disabled={mode === 'generator-lab' || armedCount === 0 || playing}>▶ PLAY</button>
        <button className="stop" onClick={stopTransport} disabled={!playing}>■ STOP</button>
      </div>
      <div className="rack-status"><span>{armedCount}/3 INSTRUMENTS ARMED</span><button className={mode === 'generator-lab' ? 'mode selected' : 'mode'} onClick={() => mode === 'generator-lab' ? exitGeneratorLab() : enterGeneratorLab()}>{mode === 'generator-lab' ? 'RACK MODE' : 'GENERATOR LAB'}</button><button className="refresh" onClick={refreshOutputs} title="Rescan MIDI output devices">↻ MIDI</button></div>
    </header>

    <section className={`rack rack-stack ${mode === 'generator-lab' ? 'lab-mode' : ''}`}>
      <div className="generator-column">
      {mode === 'generator-lab'
        ? <GeneratorLab settings={seedSettings} bpm={bpm} outputNames={{ digitone: selectedOutputs.digitone === null ? null : outputs[selectedOutputs.digitone] ?? null, digitakt: selectedOutputs.digitakt === null ? null : outputs[selectedOutputs.digitakt] ?? null, td3: selectedOutputs.td3 === null ? null : outputs[selectedOutputs.td3] ?? null }} canAudition={armedCount > 0} playingCandidateId={playingCandidateId} onSettings={setSeedSettings} onGenerate={generateLabBatch} onAudition={auditionLabCandidate} onStop={stopTransport} onExport={backend.exportLabSession} onUnexportedChange={setLabHasUnexportedSession} onExit={exitGeneratorLab} />
        : <SeedLab settings={seedSettings} onSettings={setSeedSettings} onSeed={seedRack} lastSeed={lastSeed} busy={seedBusy} />}

      {mode === 'rack' && <EuclideanGenerator digitoneTracks={digitoneTracks} digitaktTracks={digitaktTracks} td3Tracks={td3Tracks} onGenerate={applyEuclidean} />}

      {mode === 'rack' && <ArpeggioGenerator digitoneTracks={digitoneTracks} digitaktTracks={digitaktTracks} td3Tracks={td3Tracks} rootSync={arpeggioRootSync} onGenerate={applyArpeggio} />}

      <LfoRack lfos={lfos} levels={lfoLevels} onChange={updateLfo} />
      </div>

      <div className="instrument-column">
      {mode === 'rack' && <SceneMixer selected={activeScene} enabled={sceneEnabled} autoAdvance={sceneAutoAdvance} bars={sceneBars} onSelect={chooseScene} onEnabled={(id) => setSceneEnabled((current) => ({ ...current, [id]: !current[id] }))} onAutoAdvance={setSceneAutoAdvance} onBars={setSceneBars} />}
      <RackFrame className={`digitone-module instrument-module ${selectedOutputs.digitone === null ? 'module-unconfigured' : instrumentMutes.digitone ? 'module-muted' : ''}`}>
        <div className="unit-heading instrument-heading">
          <div className="module-ident">
            <button className={`instrument-mute ${instrumentMutes.digitone || selectedOutputs.digitone === null ? 'engaged' : ''}`} aria-pressed={instrumentMutes.digitone || selectedOutputs.digitone === null} disabled={selectedOutputs.digitone === null} title={selectedOutputs.digitone === null ? 'Select a MIDI output to enable this instrument.' : instrumentMutes.digitone ? 'Unmute Digitone' : 'Mute all Digitone tracks'} onClick={() => toggleInstrumentMute('digitone')}>{instrumentMutes.digitone || selectedOutputs.digitone === null ? 'MUTED' : 'MUTE ALL'}</button>
            <div><h1>DIGITONE</h1></div>
          </div>
          {selectedOutputs.digitone !== null && <SequenceToolbar label="Digitone" view={digitoneView} page={digitonePage} onView={setDigitoneView} onPage={(nextPage) => { setDigitonePage(nextPage); setSelectedStep((current) => ({ ...current, index: null })) }} />}
          {selectedOutputs.digitone !== null && <ModuleSetup target="digitone" outputs={outputs} selected={selectedOutputs.digitone} tracks={digitoneTracks} onSelect={selectModuleOutput} onChannel={(trackId, channel) => updateDigitoneTrack(trackId as DigitoneTrackId, (track) => ({ ...track, channel }))} />}
        </div>
        {selectedOutputs.digitone === null ? <ModuleConnectionSetup target="digitone" outputs={outputs} selected={selectedOutputs.digitone} tracks={digitoneTracks} onSelect={selectModuleOutput} onChannel={(trackId, channel) => updateDigitoneTrack(trackId as DigitoneTrackId, (track) => ({ ...track, channel }))} /> : <div className="module-body">
        <div className="lanes">
          {digitoneTracks.map((track) => <DigitoneLane key={track.id} track={track} view={digitoneView} page={digitonePage} selected={selectedStep.trackId === track.id ? selectedStep.index : null} currentStep={currentSteps[track.id] ?? null} lfos={lfos} lfoLevels={lfoLevels} onSelect={(index) => { setSelectedStep({ trackId: track.id, index }); setDigitonePage(Math.floor(index / pageSize)) }} onChange={(change) => updateDigitoneTrack(track.id, change)} onMacro={(macro, value) => changeMacro(track.id, macro, value)} onMacroRoute={(macro, source) => changeMacroRoute(track.id, macro, source)} onMacroDepth={(macro, depth) => changeMacroDepth(track.id, macro, depth)} />)}
        </div>

        {selectedIndex !== null && selected && <StepEditor track={selectedTrack} index={selectedIndex} step={selected} onClose={() => setSelectedStep((current) => ({ ...current, index: null }))} onChange={(change) => updateDigitoneTrack(selectedTrack.id, (track) => ({ ...track, steps: track.steps.map((step, index) => index === selectedIndex ? change(step) : step) }))} />}
        </div>}
      </RackFrame>

      <RackFrame className={`digitakt-module instrument-module ${selectedOutputs.digitakt === null ? 'module-unconfigured' : instrumentMutes.digitakt ? 'module-muted' : ''}`}>
        <div className="unit-heading instrument-heading">
          <div className="module-ident">
            <button className={`instrument-mute ${instrumentMutes.digitakt || selectedOutputs.digitakt === null ? 'engaged' : ''}`} aria-pressed={instrumentMutes.digitakt || selectedOutputs.digitakt === null} disabled={selectedOutputs.digitakt === null} title={selectedOutputs.digitakt === null ? 'Select a MIDI output to enable this instrument.' : instrumentMutes.digitakt ? 'Unmute Digitakt' : 'Mute all Digitakt tracks'} onClick={() => toggleInstrumentMute('digitakt')}>{instrumentMutes.digitakt || selectedOutputs.digitakt === null ? 'MUTED' : 'MUTE ALL'}</button>
            <div><h1>DIGITAKT</h1></div>
          </div>
          {selectedOutputs.digitakt !== null && <SequenceToolbar label="Digitakt" view={digitaktView} page={digitaktPage} onView={setDigitaktView} onPage={(nextPage) => { setDigitaktPage(nextPage); setSelectedDrumStep((current) => ({ ...current, index: null })) }} />}
          {selectedOutputs.digitakt !== null && <ModuleSetup target="digitakt" outputs={outputs} selected={selectedOutputs.digitakt} tracks={digitaktTracks} onSelect={selectModuleOutput} onChannel={(trackId, channel) => updateDigitaktTrack(trackId as DigitaktTrackId, (track) => ({ ...track, channel }))} />}
        </div>
        {selectedOutputs.digitakt === null ? <ModuleConnectionSetup target="digitakt" outputs={outputs} selected={selectedOutputs.digitakt} tracks={digitaktTracks} onSelect={selectModuleOutput} onChannel={(trackId, channel) => updateDigitaktTrack(trackId as DigitaktTrackId, (track) => ({ ...track, channel }))} /> : <div className="module-body">
        <div className="drum-lanes">
          {digitaktTracks.map((track) => <DigitaktLane key={track.id} track={track} view={digitaktView} page={digitaktPage} selected={selectedDrumStep.trackId === track.id ? selectedDrumStep.index : null} currentStep={currentSteps[track.id] ?? null} lfos={lfos} lfoLevels={lfoLevels} onSelect={(index) => { setSelectedDrumStep({ trackId: track.id, index }); setDigitaktPage(Math.floor(index / pageSize)) }} onChange={(change) => updateDigitaktTrack(track.id, change)} onMacro={(macro, value) => changeMacro(track.id, macro, value)} onMacroRoute={(macro, source) => changeMacroRoute(track.id, macro, source)} onMacroDepth={(macro, depth) => changeMacroDepth(track.id, macro, depth)} />)}
        </div>
        {selectedDrumIndex !== null && selectedDrum && <DrumStepEditor track={selectedDrumTrack} index={selectedDrumIndex} step={selectedDrum} onClose={() => setSelectedDrumStep((current) => ({ ...current, index: null }))} onChange={(change) => updateDigitaktTrack(selectedDrumTrack.id, (track) => ({ ...track, steps: track.steps.map((step, index) => index === selectedDrumIndex ? change(step) : step) }))} />}
        </div>}
      </RackFrame>

      <RackFrame className={`td3-module instrument-module ${selectedOutputs.td3 === null ? 'module-unconfigured' : instrumentMutes.td3 ? 'module-muted' : ''}`}>
        <div className="unit-heading instrument-heading">
          <div className="module-ident">
            <button className={`instrument-mute ${instrumentMutes.td3 || selectedOutputs.td3 === null ? 'engaged' : ''}`} aria-pressed={instrumentMutes.td3 || selectedOutputs.td3 === null} disabled={selectedOutputs.td3 === null} title={selectedOutputs.td3 === null ? 'Select a MIDI output to enable this instrument.' : instrumentMutes.td3 ? 'Unmute TD-3' : 'Mute TD-3'} onClick={() => toggleInstrumentMute('td3')}>{instrumentMutes.td3 || selectedOutputs.td3 === null ? 'MUTED' : 'MUTE'}</button>
            <div><h1>TD-3</h1></div>
          </div>
          {selectedOutputs.td3 !== null && <SequenceToolbar label="TD-3" view={td3View} page={td3Page} onView={setTd3View} onPage={(nextPage) => { setTd3Page(nextPage); setSelectedAcidStep((current) => ({ ...current, index: null })) }} />}
          {selectedOutputs.td3 !== null && <ModuleSetup target="td3" outputs={outputs} selected={selectedOutputs.td3} tracks={td3Tracks} onSelect={selectModuleOutput} onChannel={(trackId, channel) => updateTd3Track(trackId as Td3TrackId, (track) => ({ ...track, channel }))} />}
        </div>
        {selectedOutputs.td3 === null ? <ModuleConnectionSetup target="td3" outputs={outputs} selected={selectedOutputs.td3} tracks={td3Tracks} onSelect={selectModuleOutput} onChannel={(trackId, channel) => updateTd3Track(trackId as Td3TrackId, (track) => ({ ...track, channel }))} /> : <div className="module-body">
          <div className="lanes">
            {td3Tracks.map((track) => <Td3Lane key={track.id} track={track} view={td3View} page={td3Page} selected={selectedAcidStep.trackId === track.id ? selectedAcidStep.index : null} currentStep={currentSteps[track.id] ?? null} onSelect={(index) => { setSelectedAcidStep({ trackId: track.id, index }); setTd3Page(Math.floor(index / pageSize)) }} onChange={(change) => updateTd3Track(track.id, change)} />)}
          </div>
          {selectedAcidIndex !== null && selectedAcid && <AcidStepEditor track={selectedAcidTrack} index={selectedAcidIndex} step={selectedAcid} onClose={() => setSelectedAcidStep((current) => ({ ...current, index: null }))} onChange={(change) => updateTd3Track(selectedAcidTrack.id, (track) => ({ ...track, steps: track.steps.map((step, index) => index === selectedAcidIndex ? change(step) : step) }))} />}
        </div>}
      </RackFrame>
      </div>
    </section>
  </main>
}

function SeedLab({ settings, onSettings, onSeed, lastSeed, busy }: { settings: SeedSettings; onSettings: (settings: SeedSettings) => void; onSeed: (target: GeneratorTarget) => void; lastSeed: string; busy: boolean }): React.JSX.Element {
  const [target, setTarget] = useState<GeneratorTarget>('all')
  const update = <Key extends keyof SeedSettings>(key: Key, value: SeedSettings[Key]): void => onSettings({ ...settings, [key]: value })
  const energyIndex = (['low', 'medium', 'high'] as Energy[]).indexOf(settings.energy)
  return <RackFrame className="seed-module">
    <div className="unit-heading">
      <div><h1>PHRASE GENERATOR</h1></div>
    </div>
    <div className="seed-controls">
      <SeedSelect label="ROOT" value={settings.root} onChange={(value) => update('root', Number(value))}>{rootLabels.map((label, index) => <option value={index} key={label}>{label}</option>)}</SeedSelect>
      <SeedSelect label="HARMONY" value={settings.harmony} onChange={(value) => update('harmony', value as HarmonyColor)}>{entries(harmonyLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SeedSelect>
      <SeedSelect label="STYLE" value={settings.rhythm} onChange={(value) => update('rhythm', value as RhythmConcept)}>{entries(rhythmLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SeedSelect>
      <div className="energy-control"><span>ENERGY</span><div className="energy-slider" role="group" aria-label="Energy"><i style={{ left: `${energyIndex * 33.333}%` }} />{(['low', 'medium', 'high'] as Energy[]).map((energy) => <button key={energy} aria-pressed={settings.energy === energy} className={settings.energy === energy ? 'selected' : ''} onClick={() => update('energy', energy)}>{energy}</button>)}</div></div>
      <SeedSelect label="BASS ROLE" value={settings.bassRole} onChange={(value) => update('bassRole', value as BassRole)}>{entries(bassRoleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SeedSelect>
      <SeedSelect label="4-BAR SHAPE" value={settings.shape} onChange={(value) => update('shape', value as PhraseShape)}>{entries(phraseShapeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SeedSelect>
      <SeedSelect label="PHRASE LEADER" value={settings.leader} onChange={(value) => update('leader', value as PhraseLeader)}>{entries(phraseLeaderLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SeedSelect>
    </div>
    <div className="seed-result">
      <div className="cycle-control" role="group" aria-label="Cycle mode">
        <span>CYCLE</span>
        {(['auto', 'locked', 'poly'] as CycleMode[]).map((mode) => <button key={mode} className={settings.cycleMode === mode ? 'selected' : ''} aria-pressed={settings.cycleMode === mode} title={mode === 'auto' ? 'One style-aware Digitone cycle drifts against the four-bar frame' : mode === 'locked' ? 'Every generated lane follows the full four-bar frame' : 'Two Digitone cycles drift against the four-bar frame'} onClick={() => update('cycleMode', mode)}>{mode === 'locked' ? 'LOCKED' : mode.toUpperCase()}</button>)}
      </div>
      <strong><small>LAST</small>{lastSeed}</strong>
      <GeneratorApplyControls label="Phrase" target={target} digitoneTracks={initialDigitoneTracks} digitaktTracks={initialDigitaktTracks} td3Tracks={initialTd3Tracks} onTarget={setTarget} onApply={() => onSeed(target)} busy={busy} />
    </div>
  </RackFrame>
}

function EuclideanGenerator({ digitoneTracks, digitaktTracks, td3Tracks, onGenerate }: { digitoneTracks: DigitoneTrack[]; digitaktTracks: DigitaktTrack[]; td3Tracks: Td3Track[]; onGenerate: (settings: EuclideanSettings) => void }): React.JSX.Element {
  const [settings, setSettings] = useState<EuclideanSettings>({ trackId: 'dk-closed-hat', hits: 5, steps: 16, rotation: 0 })
  const pattern = euclideanPattern(settings.hits, settings.steps, settings.rotation)
  const updateNumber = (key: 'hits' | 'steps' | 'rotation', value: number): void => {
    if (key === 'steps') {
      const steps = Math.max(2, Math.min(stepCount, Math.round(value || 2)))
      setSettings((current) => ({ ...current, steps, hits: Math.min(current.hits, steps), rotation: Math.min(current.rotation, steps - 1) }))
      return
    }
    setSettings((current) => ({ ...current, [key]: key === 'hits'
      ? Math.max(1, Math.min(current.steps, Math.round(value || 1)))
      : Math.max(0, Math.min(current.steps - 1, Math.round(value || 0))) }))
  }
  const choosePreset = (preset: typeof euclideanPresets[number]): void => setSettings((current) => ({ ...current, hits: preset.hits, steps: preset.steps, rotation: preset.rotation }))
  const generate = (): void => {
    onGenerate(settings)
  }

  return <RackFrame className="euclidean-module">
    <div className="unit-heading euclidean-heading">
      <div><h1>EUCLIDEAN GENERATOR</h1></div>
    </div>
    <div className="generator-widget-row"><div className="generator-widget euclidean-widget"><span className="generator-widget-label">RHYTHM MAP</span><div className="euclidean-preview" aria-label={`Euclidean pattern E(${settings.hits},${settings.steps}), rotation ${settings.rotation}`}>
        {pattern.map((hit, index) => <i className={hit ? 'hit' : ''} key={index} title={`Step ${index + 1}: ${hit ? 'hit' : 'rest'}`} />)}
      </div></div><div className="widget-side-controls euclidean-widget-controls">
        <label>HITS<input aria-label="Euclidean hits" type="number" min="1" max={settings.steps} value={settings.hits} onChange={(event) => updateNumber('hits', Number(event.target.value))} /></label>
        <label>STEPS<input aria-label="Euclidean steps" type="number" min="2" max={stepCount} value={settings.steps} onChange={(event) => updateNumber('steps', Number(event.target.value))} /></label>
        <label>ROTATE<input aria-label="Euclidean rotation" type="number" min="0" max={settings.steps - 1} value={settings.rotation} onChange={(event) => updateNumber('rotation', Number(event.target.value))} /></label>
      </div></div>
    <div className="euclidean-body">
      <div className="euclidean-presets" aria-label="Euclidean rhythm shortcuts">
        {euclideanPresets.map((preset) => <button key={preset.id} className={settings.hits === preset.hits && settings.steps === preset.steps && settings.rotation === preset.rotation ? 'selected' : ''} aria-label={`${preset.label}: ${preset.context}, E(${preset.hits},${preset.steps})`} onClick={() => choosePreset(preset)}><strong>{preset.label}</strong></button>)}
      </div>
      <div className="euclidean-controls">
        <GeneratorApplyControls label="Euclidean" target={settings.trackId} digitoneTracks={digitoneTracks} digitaktTracks={digitaktTracks} td3Tracks={td3Tracks} onTarget={(trackId) => setSettings((current) => ({ ...current, trackId }))} onApply={generate} />
      </div>
    </div>
  </RackFrame>
}

function ArpeggioGenerator({ digitoneTracks, digitaktTracks, td3Tracks, rootSync, onGenerate }: { digitoneTracks: DigitoneTrack[]; digitaktTracks: DigitaktTrack[]; td3Tracks: Td3Track[]; rootSync: { root: number; revision: number }; onGenerate: (settings: ArpeggioSettings) => void }): React.JSX.Element {
  const [root, setRoot] = useState(rootSync.root)
  const [scale, setScale] = useState<ArpeggioScale>('minor')
  const [settings, setSettings] = useState<ArpeggioSettings>({
    trackId: 'dn-puncture', pitchClasses: arpeggioScaleNotes(rootSync.root, 'minor'), lowOctave: 3, highOctave: 5, direction: 'up-down', repeat: 1, triggers: 'keep'
  })
  useEffect(() => {
    setRoot(rootSync.root)
    setSettings((current) => ({ ...current, pitchClasses: arpeggioScaleNotes(rootSync.root, scale) }))
  }, [rootSync.revision])

  const chooseRoot = (nextRoot: number): void => {
    setRoot(nextRoot)
    setSettings((current) => ({ ...current, pitchClasses: arpeggioScaleNotes(nextRoot, scale) }))
  }
  const chooseScale = (nextScale: ArpeggioScale): void => {
    setScale(nextScale)
    setSettings((current) => ({ ...current, pitchClasses: arpeggioScaleNotes(root, nextScale) }))
  }

  const togglePitch = (pitchClass: number): void => setSettings((current) => ({
    ...current,
    pitchClasses: current.pitchClasses.includes(pitchClass)
      ? current.pitchClasses.filter((note) => note !== pitchClass)
      : [...current.pitchClasses, pitchClass].sort((left, right) => left - right)
  }))
  const setLowOctave = (lowOctave: number): void => setSettings((current) => ({ ...current, lowOctave, highOctave: Math.max(lowOctave, current.highOctave) }))
  const setHighOctave = (highOctave: number): void => setSettings((current) => ({ ...current, highOctave, lowOctave: Math.min(highOctave, current.lowOctave) }))

  return <RackFrame className="arpeggio-module">
    <div className="unit-heading"><div><h1>ARPEGGIO GENERATOR</h1></div></div>
    <div className="generator-widget-row"><div className="generator-widget arpeggio-widget"><span className="generator-widget-label">PITCH SET</span><MiniKeyboard selected={settings.pitchClasses} onToggle={togglePitch} /></div><div className="widget-side-controls arpeggio-widget-controls">
      <label>ROOT<select aria-label="Arpeggio root" value={root} onChange={(event) => chooseRoot(Number(event.target.value))}>{rootLabels.map((label, index) => <option value={index} key={label}>{label}</option>)}</select></label>
      <label>SCALE<select aria-label="Arpeggio scale" value={scale} onChange={(event) => chooseScale(event.target.value as ArpeggioScale)}>
        <option value="minor">MINOR</option><option value="dorian">DORIAN</option><option value="phrygian">PHRYGIAN</option><option value="major">MAJOR</option><option value="mixolydian">MIXOLYDIAN</option><option value="chromatic">CHROMATIC</option>
      </select></label>
    </div></div>
    <div className="arpeggio-controls">
      <div className="arp-field"><span>OCTAVE RANGE</span><div className="arp-range">
        <select aria-label="Arpeggio lowest octave" value={settings.lowOctave} onChange={(event) => setLowOctave(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((octave) => <option value={octave} key={octave}>{octave}</option>)}</select>
        <b>–</b>
        <select aria-label="Arpeggio highest octave" value={settings.highOctave} onChange={(event) => setHighOctave(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((octave) => <option value={octave} key={octave}>{octave}</option>)}</select>
      </div></div>
      <label>DIRECTION<select aria-label="Arpeggio direction" value={settings.direction} onChange={(event) => setSettings((current) => ({ ...current, direction: event.target.value as ArpeggioDirection }))}>
        <option value="up">UP</option><option value="down">DOWN</option><option value="up-down">UP / DOWN</option><option value="random">RANDOM</option>
      </select></label>
      <label>REPEAT<select aria-label="Arpeggio note repeat" value={settings.repeat} onChange={(event) => setSettings((current) => ({ ...current, repeat: Number(event.target.value) }))}>
        <option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option>
      </select></label>
      <label>TRIGGERS<select aria-label="Arpeggio trigger placement" value={settings.triggers} onChange={(event) => setSettings((current) => ({ ...current, triggers: event.target.value as ArpeggioTriggers }))}>
        <option value="keep">KEEP LANE</option><option value="every-2">EVERY 2</option><option value="every-1">EVERY STEP</option>
      </select></label>
      <GeneratorApplyControls label="Arpeggio" target={settings.trackId} digitoneTracks={digitoneTracks} digitaktTracks={digitaktTracks} td3Tracks={td3Tracks} onTarget={(trackId) => setSettings((current) => ({ ...current, trackId }))} onApply={() => onGenerate(settings)} disabled={settings.pitchClasses.length === 0} />
    </div>
  </RackFrame>
}

const whiteKeys = [0, 2, 4, 5, 7, 9, 11]
const blackKeys = [{ pitchClass: 1, left: '10.5%' }, { pitchClass: 3, left: '24.8%' }, { pitchClass: 6, left: '53.4%' }, { pitchClass: 8, left: '67.7%' }, { pitchClass: 10, left: '82%' }]
const arpeggioScaleIntervals: Record<ArpeggioScale, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  chromatic: Array.from({ length: 12 }, (_, index) => index)
}

function arpeggioScaleNotes(root: number, scale: ArpeggioScale): number[] {
  return arpeggioScaleIntervals[scale].map((interval) => (root + interval) % 12).sort((left, right) => left - right)
}

function MiniKeyboard({ selected, onToggle }: { selected: number[]; onToggle: (pitchClass: number) => void }): React.JSX.Element {
  return <div className="mini-keyboard" role="group" aria-label="Arpeggio notes">
    <div className="white-keys">{whiteKeys.map((pitchClass) => <button key={pitchClass} className={selected.includes(pitchClass) ? 'selected' : ''} aria-label={`Arpeggio note ${pitchClassLabels[pitchClass]}`} aria-pressed={selected.includes(pitchClass)} onClick={() => onToggle(pitchClass)} />)}</div>
    {blackKeys.map(({ pitchClass, left }) => <button key={pitchClass} className={`black-key ${selected.includes(pitchClass) ? 'selected' : ''}`} style={{ left }} aria-label={`Arpeggio note ${pitchClassLabels[pitchClass]}`} aria-pressed={selected.includes(pitchClass)} onClick={() => onToggle(pitchClass)} />)}
  </div>
}

function GeneratorApplyControls({ label, target, digitoneTracks, digitaktTracks, td3Tracks, onTarget, onApply, busy = false, disabled = false }: { label: string; target: GeneratorTarget; digitoneTracks: Array<{ id: DigitoneTrackId; label: string }>; digitaktTracks: Array<{ id: DigitaktTrackId; label: string }>; td3Tracks: Array<{ id: Td3TrackId; label: string }>; onTarget: (target: GeneratorTarget) => void; onApply: () => void; busy?: boolean; disabled?: boolean }): React.JSX.Element {
  return <div className="generator-apply-group">
    <label>APPLY TO<select aria-label={`${label} target lane`} value={target} onChange={(event) => onTarget(event.target.value as GeneratorTarget)}>
      <option value="all">ALL</option>
      <option value="all-digitone">ALL DIGITONE</option>
      <option value="all-digitakt">ALL DIGITAKT</option>
      <option value="all-td3">ALL TD-3</option>
      <optgroup label="DIGITONE">{digitoneTracks.map((track) => <option value={track.id} key={track.id}>{track.label}</option>)}</optgroup>
      <optgroup label="DIGITAKT">{digitaktTracks.map((track) => <option value={track.id} key={track.id}>{track.label}</option>)}</optgroup>
      <optgroup label="TD-3">{td3Tracks.map((track) => <option value={track.id} key={track.id}>{track.label}</option>)}</optgroup>
    </select></label>
    <button className={`generator-apply-action ${busy ? 'working' : ''}`} disabled={disabled} aria-busy={busy} aria-label={`APPLY ${label.toUpperCase()}`} onClick={onApply}><strong>{busy ? 'APPLYING…' : 'APPLY'}</strong></button>
  </div>
}

function LfoRack({ lfos, levels, onChange }: { lfos: LfoConfig[]; levels: Record<LfoId, number>; onChange: (id: LfoId, change: (lfo: LfoConfig) => LfoConfig) => void }): React.JSX.Element {
  return <RackFrame className="lfo-module">
    <div className="unit-heading">
      <div><h1>MODULATION SOURCE</h1></div>
    </div>
    <div className="lfo-grid">
      {lfos.map((lfo, index) => <section className="lfo-card" key={lfo.id}>
        <div className="lfo-title"><span>LFO {index + 1}</span><strong>{shapeGlyph(lfo.shape)}</strong></div>
        <div className="lfo-monitor" role="meter" aria-label={`LFO ${index + 1} current level`} aria-valuemin={-1} aria-valuemax={1} aria-valuenow={levels[lfo.id]}><i className="negative" style={{ width: `${Math.max(0, -levels[lfo.id]) * 50}%` }} /><b style={{ left: `${(levels[lfo.id] + 1) * 50}%` }} /><i className="positive" style={{ width: `${Math.max(0, levels[lfo.id]) * 50}%` }} /></div>
        <label>SHAPE<select aria-label={`LFO ${index + 1} shape`} value={lfo.shape} onChange={(event) => onChange(lfo.id, (current) => {
          const shape = event.target.value as LfoShape
          return { ...current, shape, points: shape === 'drawn' && !current.points?.length ? defaultDrawnPoints : current.points }
        })}>{entries(lfoShapeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>TIME<select aria-label={`LFO ${index + 1} time`} value={lfo.period} onChange={(event) => onChange(lfo.id, (current) => ({ ...current, period: event.target.value as LfoPeriod }))}>{entries(lfoPeriodLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {lfo.shape === 'drawn' && <DrawnLfoEditor index={index} points={lfo.points ?? defaultDrawnPoints} onChange={(points) => onChange(lfo.id, (current) => ({ ...current, points }))} />}
      </section>)}
    </div>
  </RackFrame>
}

function DrawnLfoEditor({ index, points, onChange }: { index: number; points: LfoPoint[]; onChange: (points: LfoPoint[]) => void }): React.JSX.Element {
  const [dragging, setDragging] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const ordered = [...points].sort((left, right) => left.x - right.x)
  const pointString = ordered.map((point) => `${5 + point.x * 230},${5 + (1 - point.y) * 40}`).join(' ')

  function eventPoint(event: React.PointerEvent<SVGSVGElement>): LfoPoint {
    const bounds = event.currentTarget.getBoundingClientRect()
    const viewX = ((event.clientX - bounds.left) / bounds.width) * 240
    const viewY = ((event.clientY - bounds.top) / bounds.height) * 90
    return {
      x: Math.round(Math.max(0, Math.min(1, (viewX - 5) / 230)) * 16) / 16,
      y: Math.round(Math.max(-1, Math.min(1, 1 - ((viewY - 5) / 80) * 2)) * 20) / 20
    }
  }

  function addPoint(event: React.PointerEvent<SVGSVGElement>): void {
    if (event.target !== event.currentTarget) return
    const point = eventPoint(event)
    if (point.x === 0 || point.x === 1) return
    onChange([...ordered.filter((current) => current.x !== point.x), point].sort((left, right) => left.x - right.x))
  }

  function movePoint(event: React.PointerEvent<SVGSVGElement>): void {
    if (dragging === null) return
    const point = eventPoint(event)
    const previous = ordered[dragging - 1]
    const next = ordered[dragging + 1]
    const x = dragging === 0 ? 0 : dragging === ordered.length - 1 ? 1 : Math.max((previous?.x ?? 0) + 1 / 16, Math.min((next?.x ?? 1) - 1 / 16, point.x))
    onChange(ordered.map((current, pointIndex) => pointIndex === dragging ? { x, y: point.y } : current))
  }

  function removePoint(pointIndex: number): void {
    if (pointIndex === 0 || pointIndex === ordered.length - 1) return
    onChange(ordered.filter((_, indexToKeep) => indexToKeep !== pointIndex))
    setSelected(null)
  }

  return <div className="drawn-lfo-editor">
    <svg viewBox="0 0 240 90" preserveAspectRatio="none" role="application" aria-label={`LFO ${index + 1} drawn shape editor`} onPointerDown={addPoint} onPointerMove={movePoint} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
      <path className="lfo-grid-lines" d="M5 5H235V85H5Z M5 25H235 M5 45H235 M5 65H235 M62.5 5V85 M120 5V85 M177.5 5V85" />
      <polyline points={pointString} />
      {ordered.map((point, pointIndex) => <circle className={selected === pointIndex ? 'selected' : ''} key={`${point.x}-${pointIndex}`} cx={5 + point.x * 230} cy={5 + (1 - point.y) * 40} r="5" aria-label={`Point ${pointIndex + 1}`} onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
        setSelected(pointIndex)
        setDragging(pointIndex)
      }} />)}
    </svg>
    <div className="drawn-lfo-actions"><button disabled={selected === null || selected === 0 || selected === ordered.length - 1} onClick={() => selected !== null && removePoint(selected)}>REMOVE</button><button onClick={() => { onChange(defaultDrawnPoints); setSelected(null) }}>RESET</button></div>
  </div>
}

function RackFrame({ children, className }: { children: React.ReactNode; className: string }): React.JSX.Element {
  return <article className={`rack-unit ${className}`}><div className="rack-ear left">●<br />●<br />●</div><div className="unit-face">{children}</div><div className="rack-ear right">●<br />●<br />●</div></article>
}

function ModuleSetup({ target, outputs, selected, tracks, onSelect, onChannel }: { target: RackTarget; outputs: string[]; selected: number | null; tracks: Array<{ id: TrackId; label: string; channel: number }>; onSelect: (target: RackTarget, port: number | null) => Promise<void>; onChannel: (trackId: TrackId, channel: number) => void }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return <div className="module-setup">
    <button className="module-setup-trigger" aria-label={`${target} MIDI setup`} aria-expanded={expanded} onClick={() => setExpanded(true)}><strong>{target.toUpperCase()} · MIDI</strong><small>SETUP</small></button>
    {expanded && <div className="module-setup-modal" role="dialog" aria-modal="true" aria-label={`${target} MIDI setup`}>
      <div className="module-setup-panel">
        <div className="module-setup-title"><span>{target.toUpperCase()} ROUTING</span><button aria-label={`Close ${target} MIDI setup`} onClick={() => setExpanded(false)}>×</button></div>
        <ConnectionFields target={target} outputs={outputs} selected={selected} tracks={tracks} onSelect={onSelect} onChannel={onChannel} />
      </div>
    </div>}
  </div>
}

function ModuleConnectionSetup({ target, outputs, selected, tracks, onSelect, onChannel }: { target: RackTarget; outputs: string[]; selected: number | null; tracks: Array<{ id: TrackId; label: string; channel: number }>; onSelect: (target: RackTarget, port: number | null) => Promise<void>; onChannel: (trackId: TrackId, channel: number) => void }): React.JSX.Element {
  return <section className="module-connection" aria-label={`${target} connection setup`}>
    <h2>SELECT A MIDI OUTPUT</h2>
    <ConnectionFields target={target} outputs={outputs} selected={selected} tracks={tracks} onSelect={onSelect} onChannel={onChannel} />
  </section>
}

function ConnectionFields({ target, outputs, selected, tracks, onSelect, onChannel }: { target: RackTarget; outputs: string[]; selected: number | null; tracks: Array<{ id: TrackId; label: string; channel: number }>; onSelect: (target: RackTarget, port: number | null) => Promise<void>; onChannel: (trackId: TrackId, channel: number) => void }): React.JSX.Element {
  return <div className="module-routing-fields">
    <label className="module-output">MIDI OUT<select value={selected ?? ''} onChange={(event) => void onSelect(target, event.target.value === '' ? null : Number(event.target.value))}><option value="">Select {target === 'digitone' ? 'Digitone' : target === 'digitakt' ? 'Digitakt' : 'TD-3'}…</option>{outputs.map((name, index) => <option value={index} key={`${name}-${index}`}>{name}</option>)}</select><small>{selected === null ? 'DISCONNECTED' : 'ARMED'}</small></label>
    <div className="channel-bank" aria-label={`${target} MIDI channels`}>{tracks.map((track) => <label key={track.id} title={track.label}><span>{track.label.replace(/^T(\d+) \/.*/, 'T$1')}</span><select aria-label={`${track.label} MIDI channel`} value={track.channel} onChange={(event) => onChannel(track.id, Number(event.target.value))}>{channelOptions()}</select></label>)}</div>
  </div>
}

function SequenceToolbar({ label, view, page, onView, onPage }: { label: string; view: SequenceView; page: number; onView: (view: SequenceView) => void; onPage: (page: number) => void }): React.JSX.Element {
  return <section className="sequence-toolbar" aria-label={`${label} sequence view`}>
    <div className="view-switch" aria-label={`${label} view mode`}>
      <button className={view === 'detail' ? 'selected' : ''} aria-pressed={view === 'detail'} onClick={() => onView('detail')}>EDIT 1 BAR</button>
      <button className={view === 'overview' ? 'selected' : ''} aria-pressed={view === 'overview'} onClick={() => onView('overview')}>VIEW 4 BARS</button>
    </div>
    <div className={`page-switch ${view === 'overview' ? 'map-mode' : ''}`} aria-label={`${label} step page`}>
      {Array.from({ length: pageCount }, (_, index) => <button key={index} disabled={view === 'overview'} className={view === 'detail' && page === index ? 'selected' : ''} aria-pressed={view === 'detail' && page === index} onClick={() => onPage(index)}><strong>BAR {index + 1}</strong><small>{index * pageSize + 1}–{(index + 1) * pageSize}</small></button>)}
    </div>
  </section>
}

function SceneMixer({ selected, enabled, autoAdvance, bars, onSelect, onEnabled, onAutoAdvance, onBars }: { selected: UnifiedSceneId; enabled: Record<SceneSequenceId, boolean>; autoAdvance: boolean; bars: SceneBarLength; onSelect: (scene: UnifiedSceneId) => void; onEnabled: (scene: SceneSequenceId) => void; onAutoAdvance: (enabled: boolean) => void; onBars: (bars: SceneBarLength) => void }): React.JSX.Element {
  const impact = sceneImpact(selected)
  return <RackFrame className="scene-module">
    <div className="unit-heading scene-heading">
      <h1>SCENE MIXER</h1>
    </div>
    <div className="generator-widget-row"><div className="generator-widget scene-widget"><span className="generator-widget-label">SCENE MIX · {unifiedSceneInfo[selected].label}</span><section className="scene-impact" aria-label={`${unifiedSceneInfo[selected].label} scene impact`}>
      {impact.map((group) => <div className="scene-impact-group" key={group.label}><strong>{group.label}</strong>{group.parts.map((part) => <div className="scene-impact-row" key={part.label}><span>{part.label}</span><i aria-label={`${part.label} ${Math.round(part.level * 100)} percent`}><b style={{ height: `${part.level * 100}%` }} /></i><output>{Math.round(part.level * 100)}%</output></div>)}</div>)}
    </section></div><div className="widget-side-controls scene-auto-controls">
        <label className="scene-auto-toggle"><span>AUTO PLAY</span><button className={autoAdvance ? 'engaged' : ''} aria-label={`AUTO ${autoAdvance ? 'ON' : 'OFF'}`} aria-pressed={autoAdvance} onClick={() => onAutoAdvance(!autoAdvance)}>{autoAdvance ? 'ON' : 'OFF'}</button></label>
        <label><span>SCENE LENGTH</span><select aria-label="Scene advance length" value={bars} onChange={(event) => onBars(Number(event.target.value) as SceneBarLength)}>{([4, 8, 16, 32, 64] as SceneBarLength[]).map((value) => <option value={value} key={value}>{value} BARS</option>)}</select></label>
      </div></div>
    <div className="scene-mixer-layout">
      <div className="scene-full-control"><span>MANUAL OVERRIDE</span><SceneTrigger label="FULL" selected={selected === 'full'} onSelect={() => onSelect('full')} /></div>
      <div className="scene-sequence"><div className="scene-section-label"><span>AUTO LOOP ORDER</span><small>LEFT → RIGHT</small></div><section className="scene-strip" aria-label="Club arrangement scenes">
        {sceneSequence.map((id) => <div className={`scene-slot ${enabled[id] ? 'enabled' : 'disabled'}`} key={id}><SceneTrigger label={unifiedSceneInfo[id].label} selected={selected === id} onSelect={() => onSelect(id)} /><button className="scene-enabled" title={enabled[id] ? 'Included in auto loop' : 'Skipped by auto loop'} aria-label={enabled[id] ? `Remove ${unifiedSceneInfo[id].label} from auto loop` : `Add ${unifiedSceneInfo[id].label} to auto loop`} aria-pressed={enabled[id]} onClick={() => onEnabled(id)}>{enabled[id] ? 'IN' : 'OUT'}</button></div>)}
      </section></div>
    </div>
  </RackFrame>
}

function SceneTrigger({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }): React.JSX.Element {
  return <button className={`scene-card ${selected ? 'selected' : ''}`} aria-label={label} aria-pressed={selected} onClick={onSelect}>
    <strong>{label}</strong>
  </button>
}

function DigitoneLane({ track, view, page, selected, currentStep, lfos, lfoLevels, onSelect, onChange, onMacro, onMacroRoute, onMacroDepth }: { track: DigitoneTrack; view: SequenceView; page: number; selected: number | null; currentStep: number | null; lfos: LfoConfig[]; lfoLevels: Record<LfoId, number>; onSelect: (index: number) => void; onChange: (change: (track: DigitoneTrack) => DigitoneTrack) => void; onMacro: (macro: 'tone' | 'space', value: number) => void; onMacroRoute: (macro: 'tone' | 'space', source: MacroSource) => void; onMacroDepth: (macro: 'tone' | 'space', depth: number) => void }): React.JSX.Element {
  const pageStart = page * pageSize
  const displayedSteps = view === 'detail' ? track.steps.slice(pageStart, pageStart + pageSize) : track.steps
  return <section className={`lane ${track.color}`}>
    <LaneMute label={track.label} muted={track.muted} onMute={() => onChange((value) => ({ ...value, muted: !value.muted }))} />
    <div className="lane-label">
      <strong className="track-title" title={track.label}>{track.label}</strong>
      <div className="lane-performance"><label>LEN<select aria-label={`${track.label} length`} value={track.length} onChange={(event) => onChange((value) => ({ ...value, length: Number(event.target.value) }))}>{trackLengthOptions(track.length).map((length) => <option key={length} value={length}>{length}</option>)}</select></label><label>GROOVE<select value={track.groove} onChange={(event) => onChange((value) => ({ ...value, groove: event.target.value as Groove }))}>{grooveOptions()}</select></label></div>
    </div>
    {view === 'detail' ? <div className="step-grid">
      {displayedSteps.map((step, offset) => { const index = pageStart + offset; return <button type="button" aria-label={`Select ${track.label} step ${index + 1}`} className={`step ${currentStep === index ? 'active' : ''} ${step.notes.length === 0 ? 'empty' : ''} ${index >= track.length ? 'outside-cycle' : ''} ${selected === index ? 'selected' : ''}`} key={index} onClick={() => onSelect(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step.notes.length ? step.notes.map((note) => noteName(clampNote(note + track.octave * 12))).join(' ') : '—'}</strong><small>{step.notes.length ? `${step.velocity} · ${step.gate}%` : 'REST'}</small></button> })}
    </div> : <SequenceMap track={track} selected={selected} currentStep={currentStep} onSelect={onSelect} />}
    <TrackMacros track={track} lfos={lfos} lfoLevels={lfoLevels} onMacro={onMacro} onMacroRoute={onMacroRoute} onMacroDepth={onMacroDepth} onOctave={onChange} />
  </section>
}

function Td3Lane({ track, view, page, selected, currentStep, onSelect, onChange }: { track: Td3Track; view: SequenceView; page: number; selected: number | null; currentStep: number | null; onSelect: (index: number) => void; onChange: (change: (track: Td3Track) => Td3Track) => void }): React.JSX.Element {
  const pageStart = page * pageSize
  const displayedSteps = view === 'detail' ? track.steps.slice(pageStart, pageStart + pageSize) : track.steps
  const formatOctave = (value: number): string => value > 0 ? `+${value}` : String(value)
  return <section className={`lane acid-lane ${track.color}`}>
    <LaneMute label={track.label} muted={track.muted} onMute={() => onChange((value) => ({ ...value, muted: !value.muted }))} />
    <div className="lane-label">
      <strong className="track-title" title={track.label}>{track.label}</strong>
      <div className="lane-performance"><label>LEN<select aria-label={`${track.label} length`} value={track.length} onChange={(event) => onChange((value) => ({ ...value, length: Number(event.target.value) }))}>{trackLengthOptions(track.length).map((length) => <option key={length} value={length}>{length}</option>)}</select></label><label>GROOVE<select value={track.groove} onChange={(event) => onChange((value) => ({ ...value, groove: event.target.value as Groove }))}>{grooveOptions()}</select></label></div>
    </div>
    {view === 'detail' ? <div className="step-grid acid-grid">
      {displayedSteps.map((step, offset) => { const index = pageStart + offset; return <button type="button" aria-label={`Select ${track.label} step ${index + 1}`} className={`step ${currentStep === index ? 'active' : ''} ${step.notes.length === 0 ? 'empty' : ''} ${step.accent ? 'acid-accent' : ''} ${step.slide ? 'acid-slide' : ''} ${index >= track.length ? 'outside-cycle' : ''} ${selected === index ? 'selected' : ''}`} key={index} onClick={() => onSelect(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step.notes.length ? noteName(clampNote(step.notes[0] + track.octave * 12)) : '—'}</strong><small>{step.notes.length ? `${step.accent ? 'A' : '·'} ${step.slide ? 'S' : '·'}` : 'REST'}</small></button> })}
    </div> : <SequenceMap track={track} selected={selected} currentStep={currentStep} onSelect={onSelect} />}
    <div className="acid-controls">
      <span>303 ARTICULATION</span><strong>ACCENT · SLIDE · OCTAVE</strong>
      <div className="octave-buttons" aria-label={`${track.shortLabel} base octave`}><button aria-label={`${track.shortLabel} octave down`} disabled={track.octave === -2} onClick={() => onChange((value) => ({ ...value, octave: value.octave - 1 }))}>−</button><strong>{formatOctave(track.octave)}</strong><button aria-label={`${track.shortLabel} octave up`} disabled={track.octave === 3} onClick={() => onChange((value) => ({ ...value, octave: value.octave + 1 }))}>+</button></div>
      <small>Accent = velocity 127 · Slide = legato overlap</small>
    </div>
  </section>
}

function DigitaktLane({ track, view, page, selected, currentStep, lfos, lfoLevels, onSelect, onChange, onMacro, onMacroRoute, onMacroDepth }: { track: DigitaktTrack; view: SequenceView; page: number; selected: number | null; currentStep: number | null; lfos: LfoConfig[]; lfoLevels: Record<LfoId, number>; onSelect: (index: number) => void; onChange: (change: (track: DigitaktTrack) => DigitaktTrack) => void; onMacro: (macro: 'tone' | 'space', value: number) => void; onMacroRoute: (macro: 'tone' | 'space', source: MacroSource) => void; onMacroDepth: (macro: 'tone' | 'space', depth: number) => void }): React.JSX.Element {
  const toggleStep = (index: number): void => onChange((current) => ({
    ...current,
    steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, notes: step.notes.length ? [] : [60], velocity: step.velocity || 100 } : step)
  }))
  const pageStart = page * pageSize
  const displayedSteps = track.steps.slice(pageStart, pageStart + pageSize)
  return <section className={`drum-lane ${track.color}`}>
    <LaneMute label={track.label} muted={track.muted} onMute={() => onChange((value) => ({ ...value, muted: !value.muted }))} />
    <div className="drum-label"><strong className="track-title" title={track.label}>{track.label}</strong><div className="drum-performance"><label>LEN<select aria-label={`${track.label} length`} value={track.length} onChange={(event) => onChange((value) => ({ ...value, length: Number(event.target.value) }))}>{trackLengthOptions(track.length).map((length) => <option key={length} value={length}>{length}</option>)}</select></label><label>GROOVE<select value={track.groove} onChange={(event) => onChange((value) => ({ ...value, groove: event.target.value as Groove }))}>{grooveOptions()}</select></label></div></div>
    {view === 'detail' ? <div className="drum-grid">{displayedSteps.map((step, offset) => { const index = pageStart + offset; return <div key={index} className={`drum-pad ${step.notes.length ? 'hit' : ''} ${step.notes.length && step.velocity >= 112 ? 'accent' : ''} ${currentStep === index ? 'active' : ''} ${selected === index ? 'selected' : ''}`}>
      <button className="drum-trigger" onClick={() => toggleStep(index)} aria-label={`Toggle ${track.label} step ${index + 1} ${step.notes.length ? 'off' : 'on'}`} title={`${step.notes.length ? 'Turn off' : 'Turn on'} step ${index + 1}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step.notes.length ? '●' : '·'}</strong><small>{step.notes.length ? `${step.velocity}/${step.probability}` : 'OFF'}</small></button>
      <button className="drum-edit" onClick={() => onSelect(index)} aria-label={`Edit ${track.label} step ${index + 1}`}>{selected === index ? 'EDITING' : 'EDIT'}</button>
    </div> })}</div> : <SequenceMap track={track} selected={selected} currentStep={currentStep} onSelect={onSelect} />}
    <TrackMacros track={track} lfos={lfos} lfoLevels={lfoLevels} onMacro={onMacro} onMacroRoute={onMacroRoute} onMacroDepth={onMacroDepth} />
  </section>
}

function SequenceMap({ track, selected, currentStep, onSelect }: { track: DigitoneTrack | DigitaktTrack | Td3Track; selected: number | null; currentStep: number | null; onSelect: (index: number) => void }): React.JSX.Element {
  return <div className="sequence-map">
    {Array.from({ length: pageCount }, (_, bar) => <div className="map-bar" key={bar}>
      <div className="map-bar-label"><strong>BAR {bar + 1}</strong><span>{bar * pageSize + 1}–{(bar + 1) * pageSize}</span></div>
      <div className="map-bar-steps">
        {track.steps.slice(bar * pageSize, (bar + 1) * pageSize).map((step, offset) => { const index = bar * pageSize + offset; return <button type="button" key={index} aria-label={`Select ${track.label} step ${index + 1}: ${step.notes.length ? 'on' : 'off'}`} title={`Bar ${bar + 1} · step ${offset + 1} · global step ${index + 1} · ${step.notes.length ? 'on' : 'off'}`} className={`map-cell ${step.notes.length ? 'on' : ''} ${currentStep === index ? 'active' : ''} ${selected === index ? 'selected' : ''} ${index >= track.length ? 'outside-cycle' : ''}`} onClick={() => onSelect(index)}><span>{offset + 1}</span><i /></button> })}
      </div>
    </div>)}
  </div>
}

function LaneMute({ label, muted, onMute }: { label: string; muted: boolean; onMute: () => void }): React.JSX.Element {
  return <button className={`lane-mute ${muted ? 'engaged' : ''}`} aria-label={muted ? 'MUTED' : 'MUTE'} title={`${muted ? 'Unmute' : 'Mute'} ${label}`} aria-pressed={muted} onClick={onMute}>{muted ? 'MUTED' : 'MUTE'}</button>
}

function TrackMacros({ track, lfos, lfoLevels, onMacro, onMacroRoute, onMacroDepth, onOctave }: { track: DigitoneTrack | DigitaktTrack; lfos: LfoConfig[]; lfoLevels: Record<LfoId, number>; onMacro: (macro: 'tone' | 'space', value: number) => void; onMacroRoute: (macro: 'tone' | 'space', source: MacroSource) => void; onMacroDepth: (macro: 'tone' | 'space', depth: number) => void; onOctave?: (change: (track: DigitoneTrack) => DigitoneTrack) => void }): React.JSX.Element {
  const toneSource = macroSource(track, 'tone')
  const spaceSource = macroSource(track, 'space')
  return <div className={`macros ${track.target === 'digitone' ? 'with-octave' : ''}`}>
    {track.target === 'digitone' && onOctave && <OctaveMacro track={track} lfoLevels={lfoLevels} onChange={onOctave} />}
    <Macro label="CUTOFF" value={track.tone} source={toneSource} depth={track.toneLfoDepth ?? 18} lfo={toneSource.startsWith('lfo-') ? lfos.find((item) => item.id === toneSource) : undefined} lfoLevel={toneSource.startsWith('lfo-') ? lfoLevels[toneSource as LfoId] : 0} routeLabel={`${track.shortLabel} Cutoff modulation source`} onChange={(value) => onMacro('tone', value)} onSource={(source) => onMacroRoute('tone', source)} onDepth={(depth) => onMacroDepth('tone', depth)} />
    <Macro label="DELAY" value={track.space} source={spaceSource} depth={track.spaceLfoDepth ?? 18} lfo={spaceSource.startsWith('lfo-') ? lfos.find((item) => item.id === spaceSource) : undefined} lfoLevel={spaceSource.startsWith('lfo-') ? lfoLevels[spaceSource as LfoId] : 0} routeLabel={`${track.shortLabel} Delay modulation source`} onChange={(value) => onMacro('space', value)} onSource={(source) => onMacroRoute('space', source)} onDepth={(depth) => onMacroDepth('space', depth)} />
  </div>
}

function OctaveMacro({ track, lfoLevels, onChange }: { track: DigitoneTrack; lfoLevels: Record<LfoId, number>; onChange: (change: (track: DigitoneTrack) => DigitoneTrack) => void }): React.JSX.Element {
  const source = track.octaveLfo
  const depth = track.octaveLfoDepth ?? 1
  const current = track.octave + (source ? Math.round(lfoLevels[source] * depth) : 0)
  const format = (value: number): string => value > 0 ? `+${value}` : String(value)
  return <div className={`octave-macro ${source ? 'patched' : ''}`}>
    <div className="macro-readout"><span>OCTAVE</span><output>{source ? `${format(current)} · ${format(track.octave - depth)}–${format(track.octave + depth)}` : format(track.octave)}</output></div>
    <div className="octave-buttons" aria-label={`${track.shortLabel} base octave`}>
      <button aria-label={`${track.shortLabel} octave down`} disabled={track.octave === -2} onClick={() => onChange((value) => ({ ...value, octave: value.octave - 1 }))}>−</button>
      <strong>{format(track.octave)}</strong>
      <button aria-label={`${track.shortLabel} octave up`} disabled={track.octave === 4} onClick={() => onChange((value) => ({ ...value, octave: value.octave + 1 }))}>+</button>
    </div>
    <select aria-label={`${track.shortLabel} Octave modulation source`} value={source ?? 'manual'} onChange={(event) => onChange((value) => ({ ...value, octaveLfo: event.target.value === 'manual' ? undefined : event.target.value as LfoId }))}>
      <option value="manual">MANUAL</option>
      {lfoIds.map((id, index) => <option value={id} key={id}>LFO {index + 1}</option>)}
    </select>
    {source && <div className="octave-depth-buttons" aria-label={`${track.shortLabel} Octave modulation depth`}>
      <span>DEPTH</span>
      <button aria-label={`${track.shortLabel} octave depth down`} disabled={depth === 1} onClick={() => onChange((value) => ({ ...value, octaveLfoDepth: depth - 1 }))}>−</button>
      <strong>±{depth}</strong>
      <button aria-label={`${track.shortLabel} octave depth up`} disabled={depth === 4} onClick={() => onChange((value) => ({ ...value, octaveLfoDepth: depth + 1 }))}>+</button>
    </div>}
  </div>
}

function Macro({ label, value, source, depth, lfo, lfoLevel, routeLabel, onChange, onSource, onDepth }: { label: string; value: number; source: MacroSource; depth: number; lfo?: LfoConfig; lfoLevel: number; routeLabel: string; onChange: (value: number) => void; onSource: (source: MacroSource) => void; onDepth: (depth: number) => void }): React.JSX.Element {
  const current = Math.round(Math.max(0, Math.min(127, value + lfoLevel * depth)))
  const [minimum, maximum] = macroRange(value, depth, lfo)
  return <div className={`macro ${source.startsWith('lfo-') ? 'patched' : ''} ${source === 'off' ? 'off' : ''}`}>
    <div className="macro-readout"><span>{label}</span><output>{source === 'off' ? 'OFF' : source === 'manual' ? value : `${current} · ${minimum}–${maximum}`}</output></div>
    <input disabled={source === 'off'} aria-label={`${routeLabel} baseline`} type="range" min="0" max="127" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    <select aria-label={routeLabel} value={source} onChange={(event) => onSource(event.target.value as MacroSource)}><option value="off">OFF</option><option value="manual">MANUAL</option>{lfoIds.map((id, index) => <option value={id} key={id}>LFO {index + 1}</option>)}</select>
    {source.startsWith('lfo-') && <label className="macro-depth"><span>DEPTH</span><input aria-label={`${routeLabel} depth`} type="range" min="-63" max="63" value={depth} onChange={(event) => onDepth(Number(event.target.value))} /><output>{depth > 0 ? '+' : ''}{depth}</output></label>}
    {source.startsWith('lfo-') && <div className="macro-motion" aria-label={`${label} modulation range ${minimum} to ${maximum}`}><span style={{ left: `${minimum / 127 * 100}%`, width: `${(maximum - minimum) / 127 * 100}%` }} /><i style={{ left: `${current / 127 * 100}%` }} /><b style={{ left: `${value / 127 * 100}%` }} /></div>}
  </div>
}

function StepEditor({ track, index, step, onChange, onClose }: { track: DigitoneTrack; index: number; step: Step; onChange: (change: (step: Step) => Step) => void; onClose: () => void }): React.JSX.Element {
  const [noteText, setNoteText] = useState(formatNotes(step.notes))
  useEffect(() => setNoteText(formatNotes(step.notes)), [track.id, index, step.notes])
  const commitNotes = (): void => {
    const parsed = parseNotes(noteText)
    if (parsed !== null) onChange((value) => ({ ...value, notes: parsed }))
    else setNoteText(formatNotes(step.notes))
  }
  return <section className={`step-editor ${track.color}`}>
    <button className="editor-close" aria-label={`Close ${track.shortLabel} cell editor`} onClick={onClose}>×</button>
    <div><span className="section-label">CELL EDITOR</span><h2>{track.shortLabel} · STEP {String(index + 1).padStart(2, '0')}</h2></div>
    <label className="notes-field">NOTES<input value={noteText} onChange={(event) => setNoteText(event.target.value)} onBlur={commitNotes} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} placeholder="D3 F3 A3" /><small>D2 · D3 F3 A3 C4 · 38 41 45 · blank = rest</small></label>
    <ValueControl label="VELOCITY" value={step.velocity} min={1} max={127} onChange={(value) => onChange((current) => ({ ...current, velocity: value }))} />
    <ValueControl label="GATE" value={step.gate} min={10} max={100} suffix="%" onChange={(value) => onChange((current) => ({ ...current, gate: value }))} />
    <ValueControl label="CHANCE" value={step.probability} min={0} max={100} suffix="%" onChange={(value) => onChange((current) => ({ ...current, probability: value }))} />
    <button className="rest" onClick={() => onChange((current) => ({ ...current, notes: [] }))}>MAKE REST</button>
  </section>
}

function AcidStepEditor({ track, index, step, onChange, onClose }: { track: Td3Track; index: number; step: Step; onChange: (change: (step: Step) => Step) => void; onClose: () => void }): React.JSX.Element {
  const [noteText, setNoteText] = useState(formatNotes(step.notes.slice(0, 1)))
  useEffect(() => setNoteText(formatNotes(step.notes.slice(0, 1))), [track.id, index, step.notes])
  const commitNote = (): void => {
    const parsed = parseNotes(noteText)
    if (parsed !== null && parsed.length <= 1) onChange((value) => ({ ...value, notes: parsed }))
    else setNoteText(formatNotes(step.notes.slice(0, 1)))
  }
  const active = step.notes.length > 0
  return <section className={`step-editor acid-step-editor ${track.color}`}>
    <button className="editor-close" aria-label={`Close ${track.shortLabel} cell editor`} onClick={onClose}>×</button>
    <div><span className="section-label">ACID CELL</span><h2>{track.shortLabel} · STEP {String(index + 1).padStart(2, '0')}</h2></div>
    <label className="notes-field">NOTE<input value={noteText} onChange={(event) => setNoteText(event.target.value)} onBlur={commitNote} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} placeholder="C2" /><small>Monophonic · one note or blank rest</small></label>
    <button className={`acid-articulation ${step.accent ? 'engaged' : ''}`} disabled={!active} aria-label="TD-3 accent" aria-pressed={Boolean(step.accent)} onClick={() => onChange((current) => ({ ...current, accent: !current.accent, velocity: !current.accent ? 127 : 92 }))}><span>ACCENT</span><strong>{step.accent ? 'ON' : 'OFF'}</strong></button>
    <button className={`acid-articulation ${step.slide ? 'engaged' : ''}`} disabled={!active} aria-label="TD-3 slide to next step" aria-pressed={Boolean(step.slide)} onClick={() => onChange((current) => ({ ...current, slide: !current.slide, gate: !current.slide ? 100 : 54 }))}><span>SLIDE →</span><strong>{step.slide ? 'ON' : 'OFF'}</strong></button>
    <ValueControl label="CHANCE" value={step.probability} min={0} max={100} suffix="%" onChange={(value) => onChange((current) => ({ ...current, probability: value }))} />
    <button className="rest" onClick={() => onChange((current) => ({ ...current, notes: [], accent: false, slide: false }))}>MAKE REST</button>
  </section>
}

function DrumStepEditor({ track, index, step, onChange, onClose }: { track: DigitaktTrack; index: number; step: Step; onChange: (change: (step: Step) => Step) => void; onClose: () => void }): React.JSX.Element {
  const enabled = step.notes.length > 0
  const shortLabel = track.label.replace(/^T\d+ \/ /, '')
  return <section className={`drum-step-editor ${track.color}`}>
    <button className="editor-close" aria-label={`Close ${shortLabel} trig editor`} onClick={onClose}>×</button>
    <div><span className="section-label">TRIG EDITOR</span><h2>{shortLabel} · STEP {String(index + 1).padStart(2, '0')}</h2></div>
    <button className={`trig-state ${enabled ? 'enabled' : ''}`} aria-pressed={enabled} onClick={() => onChange((current) => ({ ...current, notes: enabled ? [] : [60] }))}><span>TRIG</span><strong>{enabled ? 'ON' : 'OFF'}</strong><small>click to {enabled ? 'remove' : 'place'}</small></button>
    <ValueControl label="VELOCITY" value={step.velocity} min={1} max={127} onChange={(value) => onChange((current) => ({ ...current, velocity: value }))} />
    <ValueControl label="GATE" value={step.gate} min={1} max={100} suffix="%" onChange={(value) => onChange((current) => ({ ...current, gate: value }))} />
    <ValueControl label="CHANCE" value={step.probability} min={0} max={100} suffix="%" onChange={(value) => onChange((current) => ({ ...current, probability: value }))} />
  </section>
}

function SeedSelect({ label, value, onChange, children }: { label: string; value: string | number; onChange: (value: string) => void; children: React.ReactNode }): React.JSX.Element {
  return <label className="seed-select"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>
}

function ValueControl({ label, value, min, max, suffix = '', onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }): React.JSX.Element {
  return <label className="value-control">{label}<input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{value}{suffix}</output></label>
}

function drumTrack(id: DigitaktTrackId, label: string, color: Color, channel: number, hits: number[], velocity: number, groove: Groove): DigitaktTrack {
  const steps = Array.from({ length: stepCount }, (_, index): Step => ({ notes: hits.includes(index) ? [60] : [], velocity: index === hits[0] ? Math.min(127, velocity + 7) : velocity, gate: 30, probability: 100 }))
  return { id, target: 'digitakt', label, shortLabel: label.split('/ ')[1] ?? label, color, channel, length: 16, groove, muted: false, tone: 64, space: 24, steps }
}

function macroSource(track: DigitoneTrack | DigitaktTrack, macro: 'tone' | 'space'): MacroSource {
  const enabled = macro === 'tone' ? track.toneEnabled : track.spaceEnabled
  if (!enabled) return 'off'
  return (macro === 'tone' ? track.toneLfo : track.spaceLfo) ?? 'manual'
}

function macroRange(value: number, depth: number, lfo?: LfoConfig): [number, number] {
  const levels = lfo?.shape === 'drawn' && lfo.points?.length
    ? lfo.points.map((point) => point.y)
    : [-1, 1]
  const low = Math.min(...levels)
  const high = Math.max(...levels)
  const values = [value + low * depth, value + high * depth].map((next) => Math.round(Math.max(0, Math.min(127, next)))).sort((left, right) => left - right)
  return [values[0], values[1]]
}

function channelOptions(): React.JSX.Element[] { return Array.from({ length: 16 }, (_, index) => index + 1).map((channel) => <option key={channel} value={channel}>CH {channel}</option>) }
function trackLengthOptions(current: number): number[] { return [...new Set([...sequenceLengths, current])].sort((left, right) => left - right) }
const grooveLabels: Record<Groove, string> = { straight: 'Straight', push: 'Early', late: 'Late', broken: 'Push/Pull' }
function grooveOptions(): React.JSX.Element[] { return (['straight', 'push', 'late', 'broken'] as Groove[]).map((groove) => <option key={groove} value={groove}>{grooveLabels[groove]}</option>) }
function shapeGlyph(shape: LfoShape): string { return ({ sine: '∿', triangle: '△', square: '⊓', 'ramp-up': '↗', 'ramp-down': '↘', random: '⌁', drawn: '⌁' })[shape] }
function noteName(note: number): string { return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12] + (Math.floor(note / 12) - 1) }
function formatNotes(notes: number[]): string { return notes.map(noteName).join(' ') }
function clampNote(note: number): number { return Math.max(0, Math.min(127, note)) }
function targetIncludes(target: GeneratorTarget, trackId: TrackId): boolean {
  return target === 'all' || target === trackId || (target === 'all-digitone' && trackId.startsWith('dn-')) || (target === 'all-digitakt' && trackId.startsWith('dk-')) || (target === 'all-td3' && trackId.startsWith('td3-'))
}
function entries<Value>(record: Record<string, Value>): Array<[string, Value]> { return Object.entries(record) }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }

function parseNotes(value: string): number[] | null {
  if (!value.trim()) return []
  const parsed = value.trim().split(/[\s,]+/).map((token) => {
    if (/^\d{1,3}$/.test(token)) { const numeric = Number(token); return numeric >= 0 && numeric <= 127 ? numeric : null }
    const match = token.match(/^([A-Ga-g])([#♯b♭]?)(-?\d+)$/)
    if (!match) return null
    const roots: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
    let pitch = roots[match[1].toUpperCase()]
    if (match[2] === '#' || match[2] === '♯') pitch += 1
    if (match[2] === 'b' || match[2] === '♭') pitch -= 1
    const note = (Number(match[3]) + 1) * 12 + pitch
    return note >= 0 && note <= 127 ? note : null
  })
  return parsed.some((note) => note === null) ? null : [...new Set(parsed as number[])]
}

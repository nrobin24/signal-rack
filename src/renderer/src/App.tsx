import { useEffect, useState } from 'react'
import { lfoPeriodLabels } from '../../shared/lfo'
import type { DigitaktTrackId, DigitoneTrackId, Groove, LfoConfig, LfoId, LfoPeriod, LfoShape, RackTarget, SceneId, SequencerConfig, Step, TrackConfig, TrackId } from '../../shared/types'
import {
  bassRoleLabels,
  generateSeed,
  harmonyLabels,
  rhythmLabels,
  rootLabels,
  type BassRole,
  type Energy,
  type HarmonyColor,
  type RhythmConcept,
  type SeedSettings
} from './generator'

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
  color: Color
}
type SelectedStep = { trackId: DigitoneTrackId; index: number }
type OutputSelection = Record<RackTarget, number | null>

const defaultSteps = (notes: Array<number[] | null>, velocity = 100, gate = 66, probability = 100): Step[] =>
  notes.map((step) => ({ notes: step ?? [], velocity, gate, probability }))

const initialDigitoneTracks: DigitoneTrack[] = [
  {
    id: 'dn-bass', target: 'digitone', label: 'T1 / BASS', shortLabel: 'BASS', color: 'orange', channel: 1, octave: 0, length: 14,
    groove: 'straight', muted: false, tone: 62, space: 18,
    steps: defaultSteps([[38], null, [38], null, [41], null, [36], null, [38], null, [45], null, [36], null, [41], null], 106, 58)
  },
  {
    id: 'dn-vamp', target: 'digitone', label: 'T2 / VAMP', shortLabel: 'VAMP', color: 'cyan', channel: 2, octave: 0, length: 16,
    groove: 'late', muted: false, tone: 74, space: 62,
    steps: defaultSteps([null, null, [50, 53, 57, 60], null, null, null, [48, 52, 55, 59], null, null, null, [53, 57, 60, 64], null, null, null, [50, 53, 57, 60], null], 84, 75)
  },
  {
    id: 'dn-puncture', target: 'digitone', label: 'T3 / PUNCTURE', shortLabel: 'PUNCTURE', color: 'violet', channel: 3, octave: 0, length: 12,
    groove: 'broken', muted: false, tone: 96, space: 41,
    steps: defaultSteps([[74], null, null, [81], null, [77], null, null, [74], null, [86], null, null, null, [77], null], 78, 26, 68)
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

const initialLfos: LfoConfig[] = [
  { id: 'lfo-1', shape: 'sine', period: 'bar-1', depth: 18 },
  { id: 'lfo-2', shape: 'triangle', period: 'bars-2', depth: 24 },
  { id: 'lfo-3', shape: 'square', period: 'bars-4', depth: 12 },
  { id: 'lfo-4', shape: 'random', period: 'bars-8', depth: 20 }
]

const lfoShapeLabels: Record<LfoShape, string> = {
  sine: 'SINE', triangle: 'TRIANGLE', square: 'SQUARE', 'ramp-up': 'RAMP UP', 'ramp-down': 'RAMP DOWN', random: 'SAMPLE + HOLD'
}

const sceneInfo: Record<SceneId, { label: string; detail: string; density: Record<'Bass' | 'Vamp' | 'Puncture', number> }> = {
  full: { label: 'FULL', detail: 'all voices', density: { Bass: 100, Vamp: 100, Puncture: 100 } },
  bass: { label: 'BASS', detail: 'low-end focus', density: { Bass: 100, Vamp: 0, Puncture: 25 } },
  space: { label: 'SPACE', detail: 'vamp and air', density: { Bass: 55, Vamp: 100, Puncture: 40 } },
  drop: { label: 'DROP', detail: 'near silence', density: { Bass: 0, Vamp: 0, Puncture: 20 } }
}

export default function App(): React.JSX.Element {
  const [bpm, setBpm] = useState(132)
  const [outputs, setOutputs] = useState<string[]>([])
  const [selectedOutputs, setSelectedOutputs] = useState<OutputSelection>({ digitone: null, digitakt: null })
  const [playing, setPlaying] = useState(false)
  const [currentSteps, setCurrentSteps] = useState<Partial<Record<TrackId, number>>>({})
  const [digitoneTracks, setDigitoneTracks] = useState<DigitoneTrack[]>(initialDigitoneTracks)
  const [digitaktTracks, setDigitaktTracks] = useState<DigitaktTrack[]>(initialDigitaktTracks)
  const [lfos, setLfos] = useState<LfoConfig[]>(initialLfos)
  const [scene, setScene] = useState<SceneId>('full')
  const [selectedStep, setSelectedStep] = useState<SelectedStep>({ trackId: 'dn-bass', index: 0 })
  const [seedSettings, setSeedSettings] = useState<SeedSettings>({ root: 2, harmony: 'dorian', bassRole: 'anchor', rhythm: 'broken', energy: 'medium' })
  const [seedCount, setSeedCount] = useState(0)
  const [lastSeed, setLastSeed] = useState('D · Dorian smoke · Broken pocket · Anchor bass · medium energy')

  useEffect(() => {
    Promise.all([window.midi.listOutputs(), window.midi.getStatus()]).then(([nextOutputs, status]) => {
      setOutputs(nextOutputs)
      setSelectedOutputs({
        digitone: status.outputNames.digitone === null ? null : nextOutputs.indexOf(status.outputNames.digitone),
        digitakt: status.outputNames.digitakt === null ? null : nextOutputs.indexOf(status.outputNames.digitakt)
      })
      setPlaying(status.playing)
    }).catch(console.error)
    const unsubscribeStep = window.midi.onStep((steps) => setCurrentSteps(steps as Partial<Record<TrackId, number>>))
    const unsubscribeStop = window.midi.onStopped(() => { setPlaying(false); setCurrentSteps({}) })
    return () => { unsubscribeStep(); unsubscribeStop() }
  }, [])

  function config(nextDigitone = digitoneTracks, nextDigitakt = digitaktTracks, nextScene = scene, nextBpm = bpm, nextLfos = lfos): SequencerConfig {
    const digitoneConfig: TrackConfig[] = nextDigitone.map(({ id, channel, octave, length, groove, muted, tone, space, toneLfo, spaceLfo, steps }) => ({
      id, target: 'digitone', channel, length, groove, muted, tone, space, toneLfo, spaceLfo,
      steps: steps.map((step) => ({ ...step, notes: step.notes.map((note) => clampNote(note + octave * 12)) }))
    }))
    const digitaktConfig: TrackConfig[] = nextDigitakt.map(({ id, channel, length, groove, muted, steps }) => ({
      id, target: 'digitakt', channel, length, groove, muted, steps
    }))
    return { bpm: nextBpm, scene: nextScene, lfos: nextLfos, tracks: [...digitoneConfig, ...digitaktConfig] }
  }

  async function selectModuleOutput(target: RackTarget, port: number | null): Promise<void> {
    await window.midi.selectOutput(target, port)
    setSelectedOutputs((current) => ({ ...current, [target]: port }))
    if (port !== null) await window.midi.configure(config())
  }

  async function refreshOutputs(): Promise<void> {
    const [nextOutputs, status] = await Promise.all([window.midi.listOutputs(), window.midi.getStatus()])
    const nextSelection: OutputSelection = { digitone: null, digitakt: null }
    for (const target of ['digitone', 'digitakt'] as RackTarget[]) {
      const priorName = status.outputNames[target] ?? (selectedOutputs[target] === null ? null : outputs[selectedOutputs[target]])
      const nextPort = priorName === null ? null : nextOutputs.indexOf(priorName)
      nextSelection[target] = nextPort === -1 ? null : nextPort
      await window.midi.selectOutput(target, nextSelection[target])
    }
    setOutputs(nextOutputs)
    setSelectedOutputs(nextSelection)
    setPlaying(status.playing)
  }

  async function startTransport(): Promise<void> {
    if (selectedOutputs.digitone === null && selectedOutputs.digitakt === null) return
    await window.midi.configure(config())
    await window.midi.start()
    setPlaying(true)
  }

  async function stopTransport(): Promise<void> {
    await window.midi.stop()
    setPlaying(false)
    setCurrentSteps({})
  }

  function updateBpm(nextBpm: number): void {
    const safeBpm = Math.max(60, Math.min(220, nextBpm || 60))
    setBpm(safeBpm)
    if (playing) void window.midi.configure(config(digitoneTracks, digitaktTracks, scene, safeBpm))
  }

  function updateDigitoneTrack(trackId: DigitoneTrackId, change: (track: DigitoneTrack) => DigitoneTrack): void {
    setDigitoneTracks((current) => {
      const next = current.map((track) => track.id === trackId ? change(track) : track)
      if (playing) void window.midi.configure(config(next))
      return next
    })
  }

  function updateDigitaktTrack(trackId: DigitaktTrackId, change: (track: DigitaktTrack) => DigitaktTrack): void {
    setDigitaktTracks((current) => {
      const next = current.map((track) => track.id === trackId ? change(track) : track)
      if (playing) void window.midi.configure(config(digitoneTracks, next))
      return next
    })
  }

  function chooseScene(nextScene: SceneId): void {
    setScene(nextScene)
    if (playing) void window.midi.configure(config(digitoneTracks, digitaktTracks, nextScene))
  }

  function changeMacro(trackId: DigitoneTrackId, macro: 'tone' | 'space', value: number): void {
    const current = digitoneTracks.find((track) => track.id === trackId)
    if (!current) return
    const nextTrack = { ...current, [macro]: value }
    const nextTracks = digitoneTracks.map((track) => track.id === trackId ? nextTrack : track)
    setDigitoneTracks(nextTracks)
    void window.midi.configure(config(nextTracks))
    void window.midi.setMacros(trackId, nextTrack.tone, nextTrack.space)
  }

  function changeMacroRoute(trackId: DigitoneTrackId, macro: 'tone' | 'space', source: LfoId | 'manual'): void {
    const current = digitoneTracks.find((track) => track.id === trackId)
    if (!current) return
    const routeKey = macro === 'tone' ? 'toneLfo' : 'spaceLfo'
    const nextTrack = { ...current, [routeKey]: source === 'manual' ? undefined : source }
    const nextTracks = digitoneTracks.map((track) => track.id === trackId ? nextTrack : track)
    setDigitoneTracks(nextTracks)
    void window.midi.configure(config(nextTracks)).then(() => window.midi.setMacros(trackId, nextTrack.tone, nextTrack.space))
  }

  function updateLfo(id: LfoId, change: (lfo: LfoConfig) => LfoConfig): void {
    setLfos((current) => {
      const next = current.map((lfo) => lfo.id === id ? change(lfo) : lfo)
      void window.midi.configure(config(digitoneTracks, digitaktTracks, scene, bpm, next))
      return next
    })
  }

  function seedRack(): void {
    const nextCount = seedCount + 1
    const generated = generateSeed(seedSettings, nextCount)
    const generatedById = new Map(generated.tracks.map((track) => [track.id, track]))
    const nextDigitone = digitoneTracks.map((track) => {
      const next = generatedById.get(track.id)
      return next ? { ...track, length: next.length, groove: next.groove, steps: next.steps, tone: next.tone ?? track.tone, space: next.space ?? track.space } : track
    })
    const nextDigitakt = digitaktTracks.map((track) => {
      const next = generatedById.get(track.id)
      return next ? { ...track, length: next.length, groove: next.groove, steps: next.steps } : track
    })
    setDigitoneTracks(nextDigitone)
    setDigitaktTracks(nextDigitakt)
    setSeedCount(nextCount)
    setLastSeed(generated.summary)
    void window.midi.configure(config(nextDigitone, nextDigitakt))
    nextDigitone.forEach((track) => void window.midi.setMacros(track.id, track.tone, track.space))
  }

  const selectedTrack = digitoneTracks.find((track) => track.id === selectedStep.trackId) ?? digitoneTracks[0]
  const selected = selectedTrack.steps[selectedStep.index]
  const armedCount = Number(selectedOutputs.digitone !== null) + Number(selectedOutputs.digitakt !== null)

  return <main className="app-shell">
    <header className="transport">
      <div className="brand"><span className={`lamp ${playing ? 'running' : ''}`} /> SIGNAL RACK <small>0.4 · SEED / PULSE / MODULATION</small></div>
      <div className="transport-controls">
        <label>BPM<input aria-label="BPM" type="number" min="60" max="220" value={bpm} onChange={(event) => updateBpm(Number(event.target.value))} /></label>
        <button className="play" onClick={startTransport} disabled={armedCount === 0 || playing}>▶ PLAY</button>
        <button className="stop" onClick={stopTransport} disabled={!playing}>■ STOP</button>
      </div>
      <div className="rack-status"><span>{armedCount}/2 INSTRUMENTS ARMED</span><button className="refresh" onClick={refreshOutputs} title="Rescan MIDI output devices">↻ MIDI</button></div>
    </header>

    <section className="rack rack-stack">
      <SeedLab settings={seedSettings} onSettings={setSeedSettings} onSeed={seedRack} lastSeed={lastSeed} seedCount={seedCount} />

      <LfoRack lfos={lfos} onChange={updateLfo} />

      <RackFrame className="digitone-module">
        <div className="unit-heading">
          <div><span className="unit-type">INSTRUMENT MODULE 01</span><h1>DIGITONE <em>STABLE PULSE / DISRUPTED SURFACE</em></h1></div>
          <ModuleOutput target="digitone" outputs={outputs} selected={selectedOutputs.digitone} onSelect={selectModuleOutput} />
        </div>
        <p className="hint">Three melodic roles share one harmonic seed, but keep independent lengths, timing, probability, and live sound macros.</p>

        <section className="scene-strip" aria-label="Arrangement scenes">
          <span className="section-label">SCENES</span>
          {(Object.keys(sceneInfo) as SceneId[]).map((id) => <button key={id} className={scene === id ? 'selected' : ''} onClick={() => chooseScene(id)} title={sceneInfo[id].detail}><strong>{sceneInfo[id].label}</strong><small>{sceneInfo[id].detail}</small></button>)}
          <SceneLens scene={scene} />
        </section>

        <div className="lanes">
          {digitoneTracks.map((track) => <DigitoneLane key={track.id} track={track} selected={selectedStep.trackId === track.id ? selectedStep.index : null} currentStep={currentSteps[track.id] ?? null} onSelect={(index) => setSelectedStep({ trackId: track.id, index })} onChange={(change) => updateDigitoneTrack(track.id, change)} onMacro={(macro, value) => changeMacro(track.id, macro, value)} onMacroRoute={(macro, source) => changeMacroRoute(track.id, macro, source)} />)}
        </div>

        <StepEditor track={selectedTrack} index={selectedStep.index} step={selected} onChange={(change) => updateDigitoneTrack(selectedTrack.id, (track) => ({ ...track, steps: track.steps.map((step, index) => index === selectedStep.index ? change(step) : step) }))} />
      </RackFrame>

      <RackFrame className="digitakt-module">
        <div className="unit-heading">
          <div><span className="unit-type">INSTRUMENT MODULE 02</span><h1>DIGITAKT <em>RHYTHM ARCHITECTURE</em></h1></div>
          <ModuleOutput target="digitakt" outputs={outputs} selected={selectedOutputs.digitakt} onSelect={selectModuleOutput} />
        </div>
        <p className="hint">Load Sounds on Digitakt tracks 1–7 and match their MIDI channels: kick, snare, closed hat, open hat, rimshot, clap, and texture. Click steps to toggle trigs.</p>
        <div className="drum-lanes">
          {digitaktTracks.map((track) => <DigitaktLane key={track.id} track={track} currentStep={currentSteps[track.id] ?? null} onChange={(change) => updateDigitaktTrack(track.id, change)} />)}
        </div>
      </RackFrame>
    </section>
    {armedCount === 0 && <footer>Select a MIDI output inside either instrument module to arm the rack.</footer>}
  </main>
}

function SeedLab({ settings, onSettings, onSeed, lastSeed, seedCount }: { settings: SeedSettings; onSettings: (settings: SeedSettings) => void; onSeed: () => void; lastSeed: string; seedCount: number }): React.JSX.Element {
  const update = <Key extends keyof SeedSettings>(key: Key, value: SeedSettings[Key]): void => onSettings({ ...settings, [key]: value })
  return <RackFrame className="seed-module">
    <div className="unit-heading">
      <div><span className="unit-type">DIRECTION MODULE 00</span><h1>SEED LAB <em>ONE IDEA → THE WHOLE RACK</em></h1></div>
      <div className="seed-count"><span>SEEDS GROWN</span><strong>{String(seedCount).padStart(2, '0')}</strong></div>
    </div>
    <p className="hint">Choose a musical direction in plain language. Seed Lab writes related notes, chords, phrase lengths, timing, and drums into every connected instrument module.</p>
    <div className="seed-controls">
      <SeedSelect label="ROOT" value={settings.root} onChange={(value) => update('root', Number(value))}>{rootLabels.map((label, index) => <option value={index} key={label}>{label}</option>)}</SeedSelect>
      <SeedSelect label="VAMP COLOR" value={settings.harmony} onChange={(value) => update('harmony', value as HarmonyColor)}>{entries(harmonyLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SeedSelect>
      <SeedSelect label="BASS ROLE" value={settings.bassRole} onChange={(value) => update('bassRole', value as BassRole)}>{entries(bassRoleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SeedSelect>
      <SeedSelect label="RHYTHM IDEA" value={settings.rhythm} onChange={(value) => update('rhythm', value as RhythmConcept)}>{entries(rhythmLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</SeedSelect>
      <div className="energy-control"><span>ENERGY</span><div>{(['low', 'medium', 'high'] as Energy[]).map((energy) => <button key={energy} className={settings.energy === energy ? 'selected' : ''} onClick={() => update('energy', energy)}>{energy}</button>)}</div></div>
      <button className="seed-action" onClick={onSeed}><span>✦</span><strong>SEED RACK</strong><small>replace all 10 lanes</small></button>
    </div>
    <div className="seed-result"><span className="section-label">CURRENT DIRECTION</span><strong>{lastSeed}</strong><div><i>DIGITONE · 3 LANES</i><i>DIGITAKT · 7 VOICES</i></div></div>
  </RackFrame>
}

function LfoRack({ lfos, onChange }: { lfos: LfoConfig[]; onChange: (id: LfoId, change: (lfo: LfoConfig) => LfoConfig) => void }): React.JSX.Element {
  return <RackFrame className="lfo-module">
    <div className="unit-heading">
      <div><span className="unit-type">MODULATION SOURCE MODULE 00</span><h1>GLOBAL LFOs <em>CLOCKED MOVEMENT FOR THE WHOLE RACK</em></h1></div>
      <div className="sync-badge"><span>SYNC</span><strong>TRANSPORT CLOCK</strong></div>
    </div>
    <p className="hint">Set four shared movement shapes here, then choose an LFO beside a supported instrument parameter. The parameter slider remains the center value.</p>
    <div className="lfo-grid">
      {lfos.map((lfo, index) => <section className="lfo-card" key={lfo.id}>
        <div className="lfo-title"><span>LFO {index + 1}</span><strong>{shapeGlyph(lfo.shape)}</strong></div>
        <label>SHAPE<select aria-label={`LFO ${index + 1} shape`} value={lfo.shape} onChange={(event) => onChange(lfo.id, (current) => ({ ...current, shape: event.target.value as LfoShape }))}>{entries(lfoShapeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>TIME<select aria-label={`LFO ${index + 1} time`} value={lfo.period} onChange={(event) => onChange(lfo.id, (current) => ({ ...current, period: event.target.value as LfoPeriod }))}>{entries(lfoPeriodLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="lfo-depth"><span>DEPTH</span><input aria-label={`LFO ${index + 1} depth`} type="range" min="0" max="63" value={lfo.depth} onChange={(event) => onChange(lfo.id, (current) => ({ ...current, depth: Number(event.target.value) }))} /><output>±{lfo.depth}</output></label>
      </section>)}
    </div>
  </RackFrame>
}

function RackFrame({ children, className }: { children: React.ReactNode; className: string }): React.JSX.Element {
  return <article className={`rack-unit ${className}`}><div className="rack-ear left">●<br />●<br />●</div><div className="unit-face">{children}</div><div className="rack-ear right">●<br />●<br />●</div></article>
}

function ModuleOutput({ target, outputs, selected, onSelect }: { target: RackTarget; outputs: string[]; selected: number | null; onSelect: (target: RackTarget, port: number | null) => Promise<void> }): React.JSX.Element {
  return <label className="module-output">MIDI OUT<select value={selected ?? ''} onChange={(event) => void onSelect(target, event.target.value === '' ? null : Number(event.target.value))}><option value="">Select {target === 'digitone' ? 'Digitone' : 'Digitakt'}…</option>{outputs.map((name, index) => <option value={index} key={`${name}-${index}`}>{name}</option>)}</select><small>{selected === null ? 'DISCONNECTED' : 'ARMED'}</small></label>
}

function SceneLens({ scene }: { scene: SceneId }): React.JSX.Element {
  return <div className="scene-lens" aria-label={`${sceneInfo[scene].label} scene density`}>
    {entries(sceneInfo[scene].density).map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value === 0 ? 'OFF' : `${value}%`}</strong></div>)}
  </div>
}

function DigitoneLane({ track, selected, currentStep, onSelect, onChange, onMacro, onMacroRoute }: { track: DigitoneTrack; selected: number | null; currentStep: number | null; onSelect: (index: number) => void; onChange: (change: (track: DigitoneTrack) => DigitoneTrack) => void; onMacro: (macro: 'tone' | 'space', value: number) => void; onMacroRoute: (macro: 'tone' | 'space', source: LfoId | 'manual') => void }): React.JSX.Element {
  return <section className={`lane ${track.color}`}>
    <div className="lane-label">
      <LaneTitle label={track.label} muted={track.muted} onMute={() => onChange((value) => ({ ...value, muted: !value.muted }))} />
      <div className="channel-row"><label>CH<select value={track.channel} onChange={(event) => onChange((value) => ({ ...value, channel: Number(event.target.value) }))}>{channelOptions()}</select></label><label>LEN<select value={track.length} onChange={(event) => onChange((value) => ({ ...value, length: Number(event.target.value) }))}>{[8, 10, 12, 14, 16].map((length) => <option key={length} value={length}>{length}</option>)}</select></label></div>
      <label className="groove">FEEL<select value={track.groove} onChange={(event) => onChange((value) => ({ ...value, groove: event.target.value as Groove }))}>{grooveOptions()}</select></label>
      <div className="octave-controls"><button disabled={track.octave === -2} onClick={() => onChange((value) => ({ ...value, octave: value.octave - 1 }))}>−</button><strong>{track.octave > 0 ? `+${track.octave}` : track.octave}</strong><button disabled={track.octave === 4} onClick={() => onChange((value) => ({ ...value, octave: value.octave + 1 }))}>+</button><small>OCT</small></div>
    </div>
    <div className="step-grid">
      {track.steps.map((step, index) => <button type="button" className={`step ${currentStep === index ? 'active' : ''} ${step.notes.length === 0 ? 'empty' : ''} ${index >= track.length ? 'outside-cycle' : ''} ${selected === index ? 'selected' : ''}`} key={index} onClick={() => onSelect(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step.notes.length ? step.notes.map((note) => noteName(clampNote(note + track.octave * 12))).join(' ') : '—'}</strong><small>{step.notes.length ? `${step.velocity} · ${step.gate}%` : 'REST'}</small></button>)}
    </div>
    <div className="macros"><Macro label="TONE" value={track.tone} source={track.toneLfo ?? 'manual'} routeLabel={`${track.shortLabel} Tone modulation source`} onChange={(value) => onMacro('tone', value)} onSource={(source) => onMacroRoute('tone', source)} /><Macro label="SPACE" value={track.space} source={track.spaceLfo ?? 'manual'} routeLabel={`${track.shortLabel} Space modulation source`} onChange={(value) => onMacro('space', value)} onSource={(source) => onMacroRoute('space', source)} /></div>
  </section>
}

function DigitaktLane({ track, currentStep, onChange }: { track: DigitaktTrack; currentStep: number | null; onChange: (change: (track: DigitaktTrack) => DigitaktTrack) => void }): React.JSX.Element {
  const toggleStep = (index: number): void => onChange((current) => ({
    ...current,
    steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, notes: step.notes.length ? [] : [60], velocity: step.velocity || 100 } : step)
  }))
  return <section className={`drum-lane ${track.color}`}>
    <div className="drum-label"><LaneTitle label={track.label} muted={track.muted} onMute={() => onChange((value) => ({ ...value, muted: !value.muted }))} /><div><label>CH<select value={track.channel} onChange={(event) => onChange((value) => ({ ...value, channel: Number(event.target.value) }))}>{channelOptions()}</select></label><label>FEEL<select value={track.groove} onChange={(event) => onChange((value) => ({ ...value, groove: event.target.value as Groove }))}>{grooveOptions()}</select></label></div></div>
    <div className="drum-grid">{track.steps.map((step, index) => <button key={index} className={`${step.notes.length ? 'hit' : ''} ${currentStep === index ? 'active' : ''}`} onClick={() => toggleStep(index)} title={`Step ${index + 1} · velocity ${step.velocity} · chance ${step.probability}%`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step.notes.length ? (step.velocity >= 112 ? '▲' : '●') : '·'}</strong><small>{step.notes.length ? step.probability : ''}</small></button>)}</div>
  </section>
}

function LaneTitle({ label, muted, onMute }: { label: string; muted: boolean; onMute: () => void }): React.JSX.Element {
  return <div className="lane-title"><span>{label}</span><button className={`mute ${muted ? 'engaged' : ''}`} aria-pressed={muted} onClick={onMute}>{muted ? 'MUTED' : 'MUTE'}</button></div>
}

function Macro({ label, value, source, routeLabel, onChange, onSource }: { label: string; value: number; source: LfoId | 'manual'; routeLabel: string; onChange: (value: number) => void; onSource: (source: LfoId | 'manual') => void }): React.JSX.Element {
  return <div className={`macro ${source === 'manual' ? '' : 'patched'}`}><div><span>{label}</span><output>{value}</output></div><input aria-label={`${routeLabel} center`} type="range" min="0" max="127" value={value} onChange={(event) => onChange(Number(event.target.value))} /><select aria-label={routeLabel} value={source} onChange={(event) => onSource(event.target.value as LfoId | 'manual')}><option value="manual">MANUAL</option>{(['lfo-1', 'lfo-2', 'lfo-3', 'lfo-4'] as LfoId[]).map((id, index) => <option value={id} key={id}>LFO {index + 1}</option>)}</select></div>
}

function StepEditor({ track, index, step, onChange }: { track: DigitoneTrack; index: number; step: Step; onChange: (change: (step: Step) => Step) => void }): React.JSX.Element {
  const [noteText, setNoteText] = useState(formatNotes(step.notes))
  useEffect(() => setNoteText(formatNotes(step.notes)), [track.id, index, step.notes])
  const commitNotes = (): void => {
    const parsed = parseNotes(noteText)
    if (parsed !== null) onChange((value) => ({ ...value, notes: parsed }))
    else setNoteText(formatNotes(step.notes))
  }
  return <section className={`step-editor ${track.color}`}>
    <div><span className="section-label">CELL EDITOR</span><h2>{track.shortLabel} · STEP {String(index + 1).padStart(2, '0')}</h2></div>
    <label className="notes-field">NOTES<input value={noteText} onChange={(event) => setNoteText(event.target.value)} onBlur={commitNotes} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} placeholder="D3 F3 A3" /><small>D2 · D3 F3 A3 C4 · 38 41 45 · blank = rest</small></label>
    <ValueControl label="VELOCITY" value={step.velocity} min={1} max={127} onChange={(value) => onChange((current) => ({ ...current, velocity: value }))} />
    <ValueControl label="GATE" value={step.gate} min={10} max={100} suffix="%" onChange={(value) => onChange((current) => ({ ...current, gate: value }))} />
    <ValueControl label="CHANCE" value={step.probability} min={0} max={100} suffix="%" onChange={(value) => onChange((current) => ({ ...current, probability: value }))} />
    <button className="rest" onClick={() => onChange((current) => ({ ...current, notes: [] }))}>MAKE REST</button>
  </section>
}

function SeedSelect({ label, value, onChange, children }: { label: string; value: string | number; onChange: (value: string) => void; children: React.ReactNode }): React.JSX.Element {
  return <label className="seed-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>
}

function ValueControl({ label, value, min, max, suffix = '', onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }): React.JSX.Element {
  return <label className="value-control">{label}<input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{value}{suffix}</output></label>
}

function drumTrack(id: DigitaktTrackId, label: string, color: Color, channel: number, hits: number[], velocity: number, groove: Groove): DigitaktTrack {
  const steps = Array.from({ length: 16 }, (_, index): Step => ({ notes: hits.includes(index) ? [60] : [], velocity: index === hits[0] ? Math.min(127, velocity + 7) : velocity, gate: 30, probability: 100 }))
  return { id, target: 'digitakt', label, color, channel, length: 16, groove, muted: false, steps }
}

function channelOptions(): React.JSX.Element[] { return Array.from({ length: 16 }, (_, index) => index + 1).map((channel) => <option key={channel} value={channel}>CH {channel}</option>) }
function grooveOptions(): React.JSX.Element[] { return (['straight', 'push', 'late', 'broken'] as Groove[]).map((groove) => <option key={groove} value={groove}>{groove}</option>) }
function shapeGlyph(shape: LfoShape): string { return ({ sine: '∿', triangle: '△', square: '⊓', 'ramp-up': '↗', 'ramp-down': '↘', random: '⌁' })[shape] }
function noteName(note: number): string { return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12] + (Math.floor(note / 12) - 1) }
function formatNotes(notes: number[]): string { return notes.map(noteName).join(' ') }
function clampNote(note: number): number { return Math.max(0, Math.min(127, note)) }
function entries<Value>(record: Record<string, Value>): Array<[string, Value]> { return Object.entries(record) }

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

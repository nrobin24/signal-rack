import { useEffect, useState } from 'react'

type TrackId = 'bass' | 'chords' | 'puncture'
type Groove = 'straight' | 'push' | 'late' | 'broken'
type SceneId = 'full' | 'bass' | 'space' | 'drop'

type Step = { notes: number[]; velocity: number; gate: number; probability: number }
type Track = {
  id: TrackId
  label: string
  shortLabel: string
  color: 'orange' | 'cyan' | 'violet'
  channel: number
  octave: number
  length: number
  groove: Groove
  muted: boolean
  tone: number
  space: number
  steps: Step[]
}

type SelectedStep = { trackId: TrackId; index: number }

const defaultSteps = (notes: Array<number[] | null>, velocity = 100, gate = 66, probability = 100): Step[] =>
  notes.map((step) => ({ notes: step ?? [], velocity, gate, probability }))

const initialTracks: Track[] = [
  {
    id: 'bass', label: 'T1 / BASS', shortLabel: 'BASS', color: 'orange', channel: 1, octave: 0, length: 14,
    groove: 'straight', muted: false, tone: 62, space: 18,
    steps: defaultSteps([[38], null, [38], null, [41], null, [36], null, [38], null, [45], null, [36], null, [41], null], 106, 58)
  },
  {
    id: 'chords', label: 'T2 / VAMP', shortLabel: 'VAMP', color: 'cyan', channel: 2, octave: 0, length: 16,
    groove: 'late', muted: false, tone: 74, space: 62,
    steps: defaultSteps([null, null, [50, 53, 57, 60], null, null, null, [48, 52, 55, 59], null, null, null, [53, 57, 60, 64], null, null, null, [50, 53, 57, 60], null], 84, 75)
  },
  {
    id: 'puncture', label: 'T3 / PUNCTURE', shortLabel: 'PUNCTURE', color: 'violet', channel: 3, octave: 0, length: 12,
    groove: 'broken', muted: false, tone: 96, space: 41,
    steps: defaultSteps([[74], null, null, [81], null, [77], null, null, [74], null, [86], null, null, null, [77], null], 78, 26, 68)
  }
]

const scenes: Array<{ id: SceneId; label: string; detail: string }> = [
  { id: 'full', label: 'FULL', detail: 'all voices' },
  { id: 'bass', label: 'BASS', detail: 'low-end focus' },
  { id: 'space', label: 'SPACE', detail: 'vamp and air' },
  { id: 'drop', label: 'DROP', detail: 'near silence' }
]

export default function App(): React.JSX.Element {
  const [bpm, setBpm] = useState(132)
  const [outputs, setOutputs] = useState<string[]>([])
  const [output, setOutput] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentSteps, setCurrentSteps] = useState<Partial<Record<TrackId, number>>>({})
  const [tracks, setTracks] = useState<Track[]>(initialTracks)
  const [scene, setScene] = useState<SceneId>('full')
  const [selectedStep, setSelectedStep] = useState<SelectedStep>({ trackId: 'bass', index: 0 })

  useEffect(() => {
    Promise.all([window.midi.listOutputs(), window.midi.getStatus()]).then(([nextOutputs, status]) => {
      setOutputs(nextOutputs)
      setOutput(status.outputName === null ? null : nextOutputs.indexOf(status.outputName))
      setPlaying(status.playing)
    }).catch(console.error)
    const unsubscribeStep = window.midi.onStep(setCurrentSteps)
    const unsubscribeStop = window.midi.onStopped(() => { setPlaying(false); setCurrentSteps({}) })
    return () => { unsubscribeStep(); unsubscribeStop() }
  }, [])

  function config(nextTracks = tracks, nextScene = scene, nextBpm = bpm): SequencerConfig {
    return {
      bpm: nextBpm,
      scene: nextScene,
      tracks: nextTracks.map(({ id, channel, octave, length, groove, muted, tone, space, steps }) => ({
        id, channel, length, groove, muted, tone, space,
        steps: steps.map((step) => ({ ...step, notes: step.notes.map((note) => clampNote(note + octave * 12)) }))
      }))
    }
  }

  async function selectOutput(port: number): Promise<void> {
    await window.midi.selectOutput(port)
    setOutput(port)
  }

  async function refreshOutputs(): Promise<void> {
    const [nextOutputs, status] = await Promise.all([window.midi.listOutputs(), window.midi.getStatus()])
    const selectedName = status.outputName ?? (output === null ? null : outputs[output])
    setOutputs(nextOutputs)
    setPlaying(status.playing)
    if (selectedName === null) return
    const nextPort = nextOutputs.indexOf(selectedName)
    if (nextPort === -1) {
      if (playing) await window.midi.stop()
      setOutput(null); setPlaying(false); setCurrentSteps({})
      return
    }
    await window.midi.selectOutput(nextPort)
    setOutput(nextPort)
  }

  async function startTransport(): Promise<void> {
    if (output === null) return
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
    if (playing) void window.midi.configure(config(tracks, scene, safeBpm))
  }

  function updateTrack(trackId: TrackId, change: (track: Track) => Track): void {
    setTracks((current) => {
      const next = current.map((track) => track.id === trackId ? change(track) : track)
      if (playing) void window.midi.configure(config(next))
      return next
    })
  }

  function chooseScene(nextScene: SceneId): void {
    setScene(nextScene)
    if (playing) void window.midi.configure(config(tracks, nextScene))
  }

  function changeMacro(trackId: TrackId, macro: 'tone' | 'space', value: number): void {
    const current = tracks.find((track) => track.id === trackId)
    if (!current) return
    const nextTrack = { ...current, [macro]: value }
    const nextTracks = tracks.map((track) => track.id === trackId ? nextTrack : track)
    setTracks(nextTracks)
    void window.midi.configure(config(nextTracks))
    void window.midi.setMacros(trackId, nextTrack.tone, nextTrack.space)
  }

  const selectedTrack = tracks.find((track) => track.id === selectedStep.trackId) ?? tracks[0]
  const selected = selectedTrack.steps[selectedStep.index]

  return <main className="app-shell">
    <header className="transport">
      <div className="brand"><span className={`lamp ${playing ? 'running' : ''}`} /> SIGNAL RACK <small>0.2 · PULSE / FRACTURE</small></div>
      <div className="transport-controls">
        <label>BPM<input aria-label="BPM" type="number" min="60" max="220" value={bpm} onChange={(event) => updateBpm(Number(event.target.value))} /></label>
        <button className="play" onClick={startTransport} disabled={output === null || playing}>▶ PLAY</button>
        <button className="stop" onClick={stopTransport} disabled={!playing}>■ STOP</button>
      </div>
      <div className="midi-output"><label className="output-select">MIDI OUT<select value={output ?? ''} onChange={(event) => selectOutput(Number(event.target.value))}><option value="">Select Digitone…</option>{outputs.map((name, index) => <option value={index} key={`${name}-${index}`}>{name}</option>)}</select></label><button className="refresh" onClick={refreshOutputs} title="Rescan MIDI output devices">↻</button></div>
    </header>

    <section className="rack">
      <article className="rack-unit">
        <div className="rack-ear left">●<br />●<br />●<br />●</div>
        <div className="unit-face">
          <div className="unit-heading">
            <div><span className="unit-type">INSTRUMENT MODULE 01</span><h1>DIGITONE <em>STABLE PULSE / DISRUPTED SURFACE</em></h1></div>
            <div className="clock-readout"><span>{playing ? 'RUNNING' : 'READY'}</span><strong>{bpm}</strong><small>BPM · 16TH GRID</small></div>
          </div>
          <p className="hint">Edit a cell, let the three phrase lengths interlock, then use scenes as arrangement. Tone and space are live Digitone MIDI macros.</p>

          <section className="scene-strip" aria-label="Arrangement scenes">
            <span className="section-label">SCENES</span>
            {scenes.map((item) => <button key={item.id} className={scene === item.id ? 'selected' : ''} onClick={() => chooseScene(item.id)} title={item.detail}><strong>{item.label}</strong><small>{item.detail}</small></button>)}
          </section>

          <div className="lanes">
            {tracks.map((track) => <Lane key={track.id} track={track} selected={selectedStep.trackId === track.id ? selectedStep.index : null} currentStep={currentSteps[track.id] ?? null} locked={false} onSelect={(index) => setSelectedStep({ trackId: track.id, index })} onChange={(change) => updateTrack(track.id, change)} onMacro={(macro, value) => changeMacro(track.id, macro, value)} />)}
          </div>

          <StepEditor track={selectedTrack} index={selectedStep.index} step={selected} onChange={(change) => updateTrack(selectedTrack.id, (track) => ({ ...track, steps: track.steps.map((step, index) => index === selectedStep.index ? change(step) : step) }))} />
        </div>
        <div className="rack-ear right">●<br />●<br />●<br />●</div>
      </article>
    </section>
    {output === null && <footer>Select the Digitone MIDI output to arm the transport. Configure Digitone synth tracks 1–3 to receive on the three channel selectors below.</footer>}
  </main>
}

function Lane({ track, selected, currentStep, locked, onSelect, onChange, onMacro }: { track: Track; selected: number | null; currentStep: number | null; locked: boolean; onSelect: (index: number) => void; onChange: (change: (track: Track) => Track) => void; onMacro: (macro: 'tone' | 'space', value: number) => void }): React.JSX.Element {
  return <section className={`lane ${track.color}`}>
    <div className="lane-label">
      <div className="lane-title"><span>{track.label}</span><button className={`mute ${track.muted ? 'engaged' : ''}`} aria-pressed={track.muted} onClick={() => onChange((value) => ({ ...value, muted: !value.muted }))}>{track.muted ? 'MUTED' : 'MUTE'}</button></div>
      <div className="channel-row"><label>CH<select aria-label={`${track.label} MIDI channel`} value={track.channel} onChange={(event) => onChange((value) => ({ ...value, channel: Number(event.target.value) }))}>{channelOptions()}</select></label><label>LEN<select aria-label={`${track.label} phrase length`} value={track.length} onChange={(event) => onChange((value) => ({ ...value, length: Number(event.target.value) }))}>{[8, 10, 12, 14, 16].map((length) => <option key={length} value={length}>{length}</option>)}</select></label></div>
      <label className="groove">FEEL<select aria-label={`${track.label} groove`} value={track.groove} onChange={(event) => onChange((value) => ({ ...value, groove: event.target.value as Groove }))}><option value="straight">straight</option><option value="push">push</option><option value="late">late</option><option value="broken">broken</option></select></label>
      <div className="octave-controls"><button aria-label={`${track.label} octave down`} disabled={locked || track.octave === -2} onClick={() => onChange((value) => ({ ...value, octave: value.octave - 1 }))}>−</button><strong>{track.octave > 0 ? `+${track.octave}` : track.octave}</strong><button aria-label={`${track.label} octave up`} disabled={locked || track.octave === 4} onClick={() => onChange((value) => ({ ...value, octave: value.octave + 1 }))}>+</button><small>OCT</small></div>
    </div>
    <div className="step-grid">
      {track.steps.map((step, index) => <button type="button" className={`step ${currentStep === index ? 'active' : ''} ${step.notes.length === 0 ? 'empty' : ''} ${index >= track.length ? 'outside-cycle' : ''} ${selected === index ? 'selected' : ''}`} key={index} onClick={() => onSelect(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step.notes.length ? step.notes.map((note) => noteName(clampNote(note + track.octave * 12))).join(' ') : '—'}</strong><small>{step.notes.length ? `${step.velocity} · ${step.gate}%` : 'REST'}</small></button>)}
    </div>
    <div className="macros">
      <Macro label="TONE" value={track.tone} color={track.color} onChange={(value) => onMacro('tone', value)} />
      <Macro label="SPACE" value={track.space} color={track.color} onChange={(value) => onMacro('space', value)} />
    </div>
  </section>
}

function Macro({ label, value, color, onChange }: { label: string; value: number; color: string; onChange: (value: number) => void }): React.JSX.Element {
  return <label className={`macro ${color}`}>{label}<input aria-label={label} type="range" min="0" max="127" value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{value}</output></label>
}

function StepEditor({ track, index, step, onChange }: { track: Track; index: number; step: Step; onChange: (change: (step: Step) => Step) => void }): React.JSX.Element {
  const [noteText, setNoteText] = useState(formatNotes(step.notes))
  useEffect(() => setNoteText(formatNotes(step.notes)), [track.id, index, step.notes])
  const commitNotes = (): void => {
    const parsed = parseNotes(noteText)
    if (parsed !== null) onChange((value) => ({ ...value, notes: parsed }))
    else setNoteText(formatNotes(step.notes))
  }
  return <section className={`step-editor ${track.color}`}>
    <div><span className="section-label">CELL EDITOR</span><h2>{track.shortLabel} · STEP {String(index + 1).padStart(2, '0')}</h2></div>
    <label className="notes-field">NOTES<input aria-label="MIDI notes" value={noteText} onChange={(event) => setNoteText(event.target.value)} onBlur={commitNotes} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} placeholder="D3 F3 A3" /><small>Examples: D2 · D3 F3 A3 C4 · 38 41 45. Leave blank for a rest.</small></label>
    <ValueControl label="VELOCITY" value={step.velocity} min={1} max={127} onChange={(value) => onChange((current) => ({ ...current, velocity: value }))} />
    <ValueControl label="GATE" value={step.gate} min={10} max={100} suffix="%" onChange={(value) => onChange((current) => ({ ...current, gate: value }))} />
    <ValueControl label="CHANCE" value={step.probability} min={0} max={100} suffix="%" onChange={(value) => onChange((current) => ({ ...current, probability: value }))} />
    <button className="rest" onClick={() => onChange((current) => ({ ...current, notes: [] }))}>MAKE REST</button>
  </section>
}

function ValueControl({ label, value, min, max, suffix = '', onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }): React.JSX.Element {
  return <label className="value-control">{label}<input aria-label={label} type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{value}{suffix}</output></label>
}

function channelOptions(): React.JSX.Element[] {
  return Array.from({ length: 16 }, (_, index) => index + 1).map((channel) => <option key={channel} value={channel}>CH {channel}</option>)
}

function noteName(note: number): string { return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12] + (Math.floor(note / 12) - 1) }
function formatNotes(notes: number[]): string { return notes.map(noteName).join(' ') }
function clampNote(note: number): number { return Math.max(0, Math.min(127, note)) }

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

type SequencerConfig = { bpm: number; scene: SceneId; tracks: Array<{ id: TrackId; channel: number; length: number; groove: Groove; muted: boolean; tone: number; space: number; steps: Step[] }> }

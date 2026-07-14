import { useEffect, useState } from 'react'

type Step = { bass: number | null; chord: number[] }

const bassPattern = [35, null, 35, null, 38, null, 35, null, 31, null, 31, null, 33, null, 35, null]
const chordPattern = [[], [], [50, 54, 57], [], [], [52, 55, 59], [], [], [48, 52, 55], [], [], [50, 54, 57], [], [], [47, 50, 54], []]
const steps: Step[] = bassPattern.map((bass, index) => ({ bass, chord: chordPattern[index] }))

export default function App(): React.JSX.Element {
  const [bpm, setBpm] = useState(128)
  const [outputs, setOutputs] = useState<string[]>([])
  const [output, setOutput] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const [bassChannel, setBassChannel] = useState(9)
  const [chordChannel, setChordChannel] = useState(10)
  const [bassOctave, setBassOctave] = useState(0)
  const [chordOctave, setChordOctave] = useState(0)

  useEffect(() => {
    Promise.all([window.midi.listOutputs(), window.midi.getStatus()]).then(([nextOutputs, status]) => {
      setOutputs(nextOutputs)
      setOutput(status.outputName === null ? null : nextOutputs.indexOf(status.outputName))
      setPlaying(status.playing)
    }).catch(console.error)
    const unsubscribeStep = window.midi.onStep(setCurrentStep)
    const unsubscribeStop = window.midi.onStopped(() => { setPlaying(false); setCurrentStep(null) })
    return () => { unsubscribeStep(); unsubscribeStop() }
  }, [])

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
      setOutput(null)
      setPlaying(false)
      setCurrentStep(null)
      return
    }
    await window.midi.selectOutput(nextPort)
    setOutput(nextPort)
  }

  async function startTransport(): Promise<void> {
    if (output === null) return
    await window.midi.configure({ bpm, bassChannel, chordChannel, steps: transposeSteps(steps, bassOctave, chordOctave) })
    await window.midi.start()
    setPlaying(true)
  }

  async function stopTransport(): Promise<void> {
    await window.midi.stop()
    setPlaying(false)
    setCurrentStep(null)
  }

  return <main className="app-shell">
    <header className="transport">
      <div className="brand"><span className="lamp" /> SIGNAL RACK <small>0.1</small></div>
      <div className="transport-controls">
        <label>BPM<input aria-label="BPM" type="number" min="30" max="300" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} /></label>
        <button className="play" onClick={startTransport} disabled={output === null || playing}>▶ PLAY</button>
        <button className="stop" onClick={stopTransport} disabled={!playing}>■ STOP</button>
      </div>
      <div className="midi-output"><label className="output-select">MIDI OUT<select value={output ?? ''} onChange={(e) => selectOutput(Number(e.target.value))}><option value="">Select output…</option>{outputs.map((name, index) => <option value={index} key={`${name}-${index}`}>{name}</option>)}</select></label><button className="refresh" onClick={refreshOutputs} title="Rescan MIDI output devices">↻ REFRESH</button></div>
    </header>
    <section className="rack">
      <article className="rack-unit">
        <div className="rack-ear left">●<br />●<br />●</div>
        <div className="unit-face">
          <div className="unit-heading"><div><span className="unit-type">INSTRUMENT MODULE 01</span><h1>DIGITONE <em>NOTE SEQUENCER</em></h1></div><div className="channels"><label>T1 · BASS<select aria-label="Digitone T1 MIDI channel" value={bassChannel} disabled={playing} onChange={(event) => setBassChannel(Number(event.target.value))}>{channelOptions(chordChannel)}</select></label><label>T2 · CHORDS<select aria-label="Digitone T2 MIDI channel" value={chordChannel} disabled={playing} onChange={(event) => setChordChannel(Number(event.target.value))}>{channelOptions(bassChannel)}</select></label></div></div>
          <p className="hint">16 steps · clock and transport are sent from the rack · defaults are editable in the next pass</p>
          <div className="lanes">
            <Lane label={`T1 / BASS / CH ${bassChannel}`} color="orange" steps={steps} currentStep={currentStep} transpose={bassOctave} locked={playing} onTranspose={(amount) => setBassOctave((octave) => octave + amount)} render={(step) => step.bass === null ? '—' : noteName(step.bass + bassOctave * 12)} />
            <Lane label={`T2 / CHORDS / CH ${chordChannel}`} color="cyan" steps={steps} currentStep={currentStep} transpose={chordOctave} locked={playing} onTranspose={(amount) => setChordOctave((octave) => octave + amount)} render={(step) => step.chord.length ? step.chord.map((note) => noteName(note + chordOctave * 12)).join(' ') : '—'} />
          </div>
        </div>
        <div className="rack-ear right">●<br />●<br />●</div>
      </article>
    </section>
    {output === null && <footer>Select the Digitone MIDI output to arm the transport.</footer>}
  </main>
}

function Lane({ label, color, steps, currentStep, transpose, locked, onTranspose, render }: { label: string; color: string; steps: Step[]; currentStep: number | null; transpose: number; locked: boolean; onTranspose: (amount: number) => void; render: (step: Step) => string }): React.JSX.Element {
  return <div className="lane"><div className={`lane-label ${color}`}><span>{label}</span><div className="octave-controls"><button aria-label={`${label} octave down`} disabled={locked || transpose === -2} onClick={() => onTranspose(-1)}>−</button><strong>{transpose > 0 ? `+${transpose}` : transpose}</strong><button aria-label={`${label} octave up`} disabled={locked || transpose === 4} onClick={() => onTranspose(1)}>+</button></div></div><div className="step-grid">{steps.map((step, index) => <div className={`step ${currentStep === index ? 'active' : ''} ${render(step) === '—' ? 'empty' : ''}`} key={index}><span>{String(index + 1).padStart(2, '0')}</span><strong>{render(step)}</strong></div>)}</div></div>
}

function noteName(note: number): string { return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12] + (Math.floor(note / 12) - 1) }

function channelOptions(excludedChannel: number): React.JSX.Element[] {
  return Array.from({ length: 16 }, (_, index) => index + 1).map((channel) => <option key={channel} value={channel} disabled={channel === excludedChannel}>CH {channel}</option>)
}

function transposeSteps(source: Step[], bassOctave: number, chordOctave: number): Step[] {
  const clamp = (note: number): number => Math.max(0, Math.min(127, note))
  return source.map((step) => ({ bass: step.bass === null ? null : clamp(step.bass + bassOctave * 12), chord: step.chord.map((note) => clamp(note + chordOctave * 12)) }))
}

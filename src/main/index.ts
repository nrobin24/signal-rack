import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { Output } from '@julusian/midi'

type TrackId = 'bass' | 'chords' | 'puncture'
type Groove = 'straight' | 'push' | 'late' | 'broken'
type SceneId = 'full' | 'bass' | 'space' | 'drop'
type Step = { notes: number[]; velocity: number; gate: number; probability: number }
type TrackConfig = { id: TrackId; channel: number; length: number; groove: Groove; muted: boolean; tone: number; space: number; steps: Step[] }
type SequencerConfig = { bpm: number; scene: SceneId; tracks: TrackConfig[] }

let window: BrowserWindow | null = null
let output: Output | null = null
let openedPort = -1
let openedPortName: string | null = null
let clock: NodeJS.Timeout | null = null
let releaseTimers: NodeJS.Timeout[] = []
let scheduledTimers: NodeJS.Timeout[] = []
let pulse = 0
let config: SequencerConfig = { bpm: 132, scene: 'full', tracks: [] }

const sceneDensity: Record<SceneId, Record<TrackId, number>> = {
  full: { bass: 1, chords: 1, puncture: 1 },
  bass: { bass: 1, chords: 0, puncture: 0.25 },
  space: { bass: 0.55, chords: 1, puncture: 0.4 },
  drop: { bass: 0, chords: 0, puncture: 0.2 }
}

function midiMessage(message: number[]): void {
  if (output && openedPort >= 0) output.sendMessage(message)
}

function allNotesOff(): void {
  for (const channel of new Set(config.tracks.map((track) => track.channel))) midiMessage([0xb0 + channel - 1, 123, 0])
  releaseTimers.forEach(clearTimeout)
  scheduledTimers.forEach(clearTimeout)
  releaseTimers = []
  scheduledTimers = []
}

function scheduleRelease(callback: () => void, delay: number): void {
  let timer: NodeJS.Timeout
  timer = setTimeout(() => {
    releaseTimers = releaseTimers.filter((candidate) => candidate !== timer)
    callback()
  }, delay)
  releaseTimers.push(timer)
}

function scheduleEvent(callback: () => void, delay: number): void {
  let timer: NodeJS.Timeout
  timer = setTimeout(() => {
    scheduledTimers = scheduledTimers.filter((candidate) => candidate !== timer)
    callback()
  }, delay)
  scheduledTimers.push(timer)
}

function stepDurationMs(): number { return 60_000 / config.bpm / 4 }

function grooveOffset(groove: Groove, stepIndex: number): number {
  if (groove === 'straight') return 0
  if (groove === 'push') return stepIndex % 4 === 2 ? -20 : stepIndex % 2 ? -9 : 0
  if (groove === 'late') return stepIndex % 4 === 3 ? 32 : stepIndex % 2 ? 15 : 0
  return [0, 28, -15, 16][stepIndex % 4]
}

function sendNRPN(channel: number, parameter: number, value: number): void {
  const status = 0xb0 + channel - 1
  const safeValue = Math.max(0, Math.min(127, Math.round(value)))
  midiMessage([status, 99, 1])
  midiMessage([status, 98, parameter])
  midiMessage([status, 6, safeValue])
  midiMessage([status, 38, 0])
  midiMessage([status, 101, 127])
  midiMessage([status, 100, 127])
}

function sendTrackMacros(track: TrackConfig): void {
  const filter = 20 + track.tone * 107 / 127
  const feedback = track.tone * 0.6
  const delay = track.space * 0.8
  const reverb = track.space * 0.95
  sendNRPN(track.channel, 20, filter) // Filter frequency
  sendNRPN(track.channel, 78, feedback) // FM feedback
  sendNRPN(track.channel, 40, delay) // Delay send
  sendNRPN(track.channel, 39, reverb) // Reverb send
}

function sendAllMacros(): void { config.tracks.forEach(sendTrackMacros) }

function playTrackStep(track: TrackConfig, stepIndex: number): void {
  const currentTrack = config.tracks.find((candidate) => candidate.id === track.id) ?? track
  if (currentTrack.muted) return
  const step = currentTrack.steps[stepIndex % currentTrack.length]
  if (!step || step.notes.length === 0) return
  if (Math.random() * 100 >= step.probability * sceneDensity[config.scene][currentTrack.id]) return
  const notes = step.notes.map((note) => Math.max(0, Math.min(127, note)))
  notes.forEach((note) => midiMessage([0x90 + currentTrack.channel - 1, note, step.velocity]))
  const releaseAfterMs = Math.max(12, stepDurationMs() * step.gate / 100)
  scheduleRelease(() => notes.forEach((note) => midiMessage([0x80 + currentTrack.channel - 1, note, 0])), releaseAfterMs)
}

function playStep(globalStep: number): void {
  const positions: Partial<Record<TrackId, number>> = {}
  config.tracks.forEach((track) => { positions[track.id] = globalStep % track.length })
  window?.webContents.send('sequencer:step', positions)

  config.tracks.forEach((track) => {
    const index = globalStep % track.length
    if (globalStep === 0 || grooveOffset(track.groove, index) >= 0) {
      const delay = Math.max(0, grooveOffset(track.groove, index))
      if (delay === 0) playTrackStep(track, index)
      else scheduleEvent(() => playTrackStep(track, index), delay)
    }
  })

  config.tracks.forEach((track) => {
    const nextIndex = (globalStep + 1) % track.length
    const early = grooveOffset(track.groove, nextIndex)
    if (early < 0) scheduleEvent(() => playTrackStep(track, nextIndex), Math.max(0, stepDurationMs() + early))
  })
}

function tick(): void {
  midiMessage([0xf8])
  if (pulse % 6 === 0) playStep(Math.floor(pulse / 6))
  pulse = (pulse + 1) % (24 * 4 * 16)
}

function restartClock(): void {
  if (clock) clearInterval(clock)
  clock = setInterval(tick, 60_000 / config.bpm / 24)
}

function stopTransport(): void {
  if (clock) midiMessage([0xfc])
  if (clock) clearInterval(clock)
  clock = null
  allNotesOff()
  window?.webContents.send('sequencer:stopped')
}

function startTransport(): void {
  stopTransport()
  pulse = 0
  sendAllMacros()
  midiMessage([0xfa])
  tick()
  restartClock()
}

function listOutputs(): string[] {
  const probe = new Output()
  const ports = Array.from({ length: probe.getPortCount() }, (_, index) => probe.getPortName(index))
  probe.closePort()
  return ports
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1080,
    minHeight: 760,
    title: 'Signal Rack',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false }
  })
  window.on('closed', () => (window = null))
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle('midi:list-outputs', listOutputs)
  ipcMain.handle('midi:select-output', (_, port: number) => {
    if (output) output.closePort()
    output = new Output()
    output.openPort(port)
    openedPort = port
    openedPortName = output.getPortName(port)
  })
  ipcMain.handle('midi:status', () => ({ playing: clock !== null, outputName: openedPortName }))
  ipcMain.handle('sequencer:configure', (_, next: SequencerConfig) => {
    const tempoChanged = config.bpm !== next.bpm
    const newlyMutedChannels = next.tracks
      .filter((track) => track.muted && !config.tracks.find((previous) => previous.id === track.id)?.muted)
      .map((track) => track.channel)
    config = next
    for (const channel of newlyMutedChannels) midiMessage([0xb0 + channel - 1, 123, 0])
    if (clock && tempoChanged) restartClock()
  })
  ipcMain.handle('sequencer:set-macros', (_, trackId: TrackId, tone: number, space: number) => {
    const track = config.tracks.find((item) => item.id === trackId)
    if (!track) return
    track.tone = tone
    track.space = space
    sendTrackMacros(track)
  })
  ipcMain.handle('sequencer:start', startTransport)
  ipcMain.handle('sequencer:stop', stopTransport)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', stopTransport)

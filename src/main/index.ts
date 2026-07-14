import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { Output } from '@julusian/midi'
import { modulatedValue } from '../shared/lfo'
import type { DigitoneTrackId, Groove, LfoId, RackTarget, SceneId, SequencerConfig, TrackConfig, TrackId } from '../shared/types'

type PortConnection = { output: Output; name: string; targets: Set<RackTarget> }

let window: BrowserWindow | null = null
let clock: NodeJS.Timeout | null = null
let releaseTimers: NodeJS.Timeout[] = []
let scheduledTimers: NodeJS.Timeout[] = []
let pulse = 0
let config: SequencerConfig = { bpm: 132, scene: 'full', lfos: [], tracks: [] }
const targetPorts: Partial<Record<RackTarget, number>> = {}
const portConnections = new Map<number, PortConnection>()

const sceneDensity: Record<SceneId, Record<DigitoneTrackId, number>> = {
  full: { 'dn-bass': 1, 'dn-vamp': 1, 'dn-puncture': 1 },
  bass: { 'dn-bass': 1, 'dn-vamp': 0, 'dn-puncture': 0.25 },
  space: { 'dn-bass': 0.55, 'dn-vamp': 1, 'dn-puncture': 0.4 },
  drop: { 'dn-bass': 0, 'dn-vamp': 0, 'dn-puncture': 0.2 }
}

function midiMessage(target: RackTarget, message: number[]): void {
  const port = targetPorts[target]
  if (port === undefined) return
  portConnections.get(port)?.output.sendMessage(message)
}

function broadcastMessage(message: number[]): void {
  portConnections.forEach(({ output }) => output.sendMessage(message))
}

function detachTarget(target: RackTarget): void {
  const port = targetPorts[target]
  if (port === undefined) return
  const connection = portConnections.get(port)
  connection?.targets.delete(target)
  delete targetPorts[target]
  if (connection && connection.targets.size === 0) {
    connection.output.closePort()
    portConnections.delete(port)
  }
}

function selectOutput(target: RackTarget, port: number | null): void {
  if (clock) {
    midiMessage(target, [0xfc])
    config.tracks.filter((track) => track.target === target).forEach((track) => midiMessage(target, [0xb0 + track.channel - 1, 123, 0]))
  }
  detachTarget(target)
  if (port === null) return

  let connection = portConnections.get(port)
  if (!connection) {
    const nextOutput = new Output()
    if (port < 0 || port >= nextOutput.getPortCount()) {
      nextOutput.closePort()
      throw new Error(`MIDI output ${port} is no longer available`)
    }
    const name = nextOutput.getPortName(port)
    nextOutput.openPort(port)
    connection = { output: nextOutput, name, targets: new Set() }
    portConnections.set(port, connection)
  }
  connection.targets.add(target)
  targetPorts[target] = port
  if (clock) midiMessage(target, [0xfa])
}

function outputName(target: RackTarget): string | null {
  const port = targetPorts[target]
  return port === undefined ? null : portConnections.get(port)?.name ?? null
}

function closeOutputs(): void {
  portConnections.forEach(({ output }) => output.closePort())
  portConnections.clear()
  delete targetPorts.digitone
  delete targetPorts.digitakt
}

function allNotesOff(): void {
  config.tracks.forEach((track) => midiMessage(track.target, [0xb0 + track.channel - 1, 123, 0]))
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

function sendNRPN(target: RackTarget, channel: number, parameter: number, value: number): void {
  const status = 0xb0 + channel - 1
  const safeValue = Math.max(0, Math.min(127, Math.round(value)))
  midiMessage(target, [status, 99, 1])
  midiMessage(target, [status, 98, parameter])
  midiMessage(target, [status, 6, safeValue])
  midiMessage(target, [status, 38, 0])
  midiMessage(target, [status, 101, 127])
  midiMessage(target, [status, 100, 127])
}

function sendTone(track: TrackConfig, tone: number): void {
  sendNRPN('digitone', track.channel, 20, 20 + tone * 107 / 127)
  sendNRPN('digitone', track.channel, 78, tone * 0.6)
}

function sendSpace(track: TrackConfig, space: number): void {
  sendNRPN('digitone', track.channel, 40, space * 0.8)
  sendNRPN('digitone', track.channel, 39, space * 0.95)
}

function modulatedMacroValue(track: TrackConfig, macro: 'tone' | 'space'): number {
  const base = track[macro] ?? (macro === 'tone' ? 64 : 32)
  const source: LfoId | undefined = macro === 'tone' ? track.toneLfo : track.spaceLfo
  const lfo = source ? config.lfos.find((candidate) => candidate.id === source) : undefined
  return modulatedValue(base, lfo, clock ? pulse : 0)
}

function sendTrackMacros(track: TrackConfig): void {
  if (track.target !== 'digitone') return
  sendTone(track, modulatedMacroValue(track, 'tone'))
  sendSpace(track, modulatedMacroValue(track, 'space'))
}

function sendAllMacros(): void { config.tracks.forEach(sendTrackMacros) }

function sendLfoMacros(): void {
  config.tracks.forEach((track) => {
    if (track.target !== 'digitone') return
    if (track.toneLfo) sendTone(track, modulatedMacroValue(track, 'tone'))
    if (track.spaceLfo) sendSpace(track, modulatedMacroValue(track, 'space'))
  })
}

function trackDensity(track: TrackConfig): number {
  return track.target === 'digitone' ? sceneDensity[config.scene][track.id as DigitoneTrackId] : 1
}

function playTrackStep(track: TrackConfig, stepIndex: number): void {
  const currentTrack = config.tracks.find((candidate) => candidate.id === track.id) ?? track
  if (currentTrack.muted || targetPorts[currentTrack.target] === undefined) return
  const step = currentTrack.steps[stepIndex % currentTrack.length]
  if (!step || step.notes.length === 0) return
  if (Math.random() * 100 >= step.probability * trackDensity(currentTrack)) return
  const notes = step.notes.map((note) => Math.max(0, Math.min(127, note)))
  notes.forEach((note) => midiMessage(currentTrack.target, [0x90 + currentTrack.channel - 1, note, step.velocity]))
  const releaseAfterMs = Math.max(12, stepDurationMs() * step.gate / 100)
  scheduleRelease(() => notes.forEach((note) => midiMessage(currentTrack.target, [0x80 + currentTrack.channel - 1, note, 0])), releaseAfterMs)
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
  broadcastMessage([0xf8])
  if (pulse % 6 === 0) {
    playStep(Math.floor(pulse / 6))
    sendLfoMacros()
  }
  pulse += 1
}

function restartClock(): void {
  if (clock) clearInterval(clock)
  clock = setInterval(tick, 60_000 / config.bpm / 24)
}

function stopTransport(): void {
  if (clock) broadcastMessage([0xfc])
  if (clock) clearInterval(clock)
  clock = null
  allNotesOff()
  window?.webContents.send('sequencer:stopped')
}

function startTransport(): void {
  stopTransport()
  pulse = 0
  sendAllMacros()
  broadcastMessage([0xfa])
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
  ipcMain.handle('midi:select-output', (_, target: RackTarget, port: number | null) => selectOutput(target, port))
  ipcMain.handle('midi:status', () => ({
    playing: clock !== null,
    outputNames: { digitone: outputName('digitone'), digitakt: outputName('digitakt') }
  }))
  ipcMain.handle('sequencer:configure', (_, next: SequencerConfig) => {
    const tempoChanged = config.bpm !== next.bpm
    const newlyMuted = next.tracks.filter((track) => track.muted && !config.tracks.find((previous) => previous.id === track.id)?.muted)
    config = next
    newlyMuted.forEach((track) => midiMessage(track.target, [0xb0 + track.channel - 1, 123, 0]))
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
app.on('before-quit', () => { stopTransport(); closeOutputs() })

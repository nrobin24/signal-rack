import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { Output } from '@julusian/midi'

type Step = { bass: number | null; chord: number[] }
type SequencerConfig = { bpm: number; bassChannel: number; chordChannel: number; steps: Step[] }

let window: BrowserWindow | null = null
let output: Output | null = null
let openedPort = -1
let openedPortName: string | null = null
let clock: NodeJS.Timeout | null = null
let releaseTimers: NodeJS.Timeout[] = []
let pulse = 0
let config: SequencerConfig = { bpm: 120, bassChannel: 1, chordChannel: 2, steps: [] }

function midiMessage(message: number[]): void {
  if (output && openedPort >= 0) output.sendMessage(message)
}

function allNotesOff(): void {
  midiMessage([0xb0 + config.bassChannel - 1, 123, 0])
  midiMessage([0xb0 + config.chordChannel - 1, 123, 0])
  releaseTimers.forEach(clearTimeout)
  releaseTimers = []
}

function playStep(stepIndex: number): void {
  const step = config.steps[stepIndex]
  if (!step) return
  window?.webContents.send('sequencer:step', stepIndex)
  const notes = [
    ...(step.bass === null ? [] : [{ note: step.bass, channel: config.bassChannel }]),
    ...step.chord.map((note) => ({ note, channel: config.chordChannel }))
  ]
  notes.forEach(({ note, channel }) => midiMessage([0x90 + channel - 1, note, 100]))
  const releaseAfterMs = (60_000 / config.bpm / 4) * 0.72
  releaseTimers.push(
    setTimeout(() => {
      notes.forEach(({ note, channel }) => midiMessage([0x80 + channel - 1, note, 0]))
    }, releaseAfterMs)
  )
}

function stopTransport(): void {
  if (clock) clearInterval(clock)
  clock = null
  midiMessage([0xfc])
  allNotesOff()
  window?.webContents.send('sequencer:stopped')
}

function startTransport(): void {
  stopTransport()
  pulse = 0
  midiMessage([0xfa])
  const tick = () => {
    midiMessage([0xf8])
    if (pulse % 6 === 0) playStep(Math.floor(pulse / 6) % config.steps.length)
    pulse = (pulse + 1) % (24 * 4 * 4)
  }
  tick()
  clock = setInterval(tick, 60_000 / config.bpm / 24)
}

function listOutputs(): string[] {
  const probe = new Output()
  const ports = Array.from({ length: probe.getPortCount() }, (_, index) => probe.getPortName(index))
  probe.closePort()
  return ports
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1260,
    height: 820,
    minWidth: 900,
    minHeight: 620,
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
  ipcMain.handle('sequencer:configure', (_, next: SequencerConfig) => (config = next))
  ipcMain.handle('sequencer:start', startTransport)
  ipcMain.handle('sequencer:stop', stopTransport)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', stopTransport)

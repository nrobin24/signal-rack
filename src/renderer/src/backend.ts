import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { documentDir, join } from '@tauri-apps/api/path'
import { save } from '@tauri-apps/plugin-dialog'
import type { LfoId, RackTarget, SequencerConfig, TrackId } from '../../shared/types'
import type { GeneratedSeed, SeedSettings } from './seed'

type EngineStatus = {
  playing: boolean
  outputNames: Record<RackTarget, string | null>
}

type MockBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
  listen<T>(event: string, callback: (payload: T) => void): Promise<UnlistenFn>
}

declare global {
  interface Window {
    __SIGNAL_RACK_MOCK__?: MockBridge
  }
}

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return window.__SIGNAL_RACK_MOCK__?.invoke<T>(command, args) ?? invoke<T>(command, args)
}

function subscribe<T>(event: string, callback: (payload: T) => void): Promise<UnlistenFn> {
  if (window.__SIGNAL_RACK_MOCK__) return window.__SIGNAL_RACK_MOCK__.listen(event, callback)
  return listen<T>(event, ({ payload }) => callback(payload))
}

export type LabSessionExport = {
  path: string
  fileName: string
}

async function exportLabSession(sessionId: string, contents: string, previousPath?: string): Promise<LabSessionExport | null> {
  const suggestedPath = previousPath ?? (window.__SIGNAL_RACK_MOCK__
    ? `${sessionId}.json`
    : await join(await documentDir(), `${sessionId}.json`))
  const selectedPath = window.__SIGNAL_RACK_MOCK__
    ? await call<string | null>('choose_lab_session_path', { suggestedPath })
    : await save({
        title: 'Export Generator Lab Session',
        defaultPath: suggestedPath,
        filters: [{ name: 'JSON session', extensions: ['json'] }]
      })

  if (selectedPath === null) return null
  const path = await call<string>('save_lab_session', { path: selectedPath, contents })
  return { path, fileName: path.split(/[\\/]/).pop() ?? path }
}

export const backend = {
  listOutputs: (): Promise<string[]> => call('list_outputs'),
  getStatus: (): Promise<EngineStatus> => call('get_status'),
  selectOutput: (target: RackTarget, port: number | null): Promise<void> => call('select_output', { target, port }),
  configure: (config: SequencerConfig): Promise<void> => call('configure', { config }),
  setMacros: (trackId: TrackId, tone: number, space: number): Promise<void> => call('set_macros', { trackId, tone, space }),
  start: (): Promise<void> => call('start_transport'),
  stop: (): Promise<void> => call('stop_transport'),
  generateSeed: (settings: SeedSettings, variation: number): Promise<GeneratedSeed> => call('generate_seed', { settings, variation }),
  exportLabSession,
  onStep: (callback: (steps: Partial<Record<TrackId, number>>) => void): Promise<UnlistenFn> => subscribe('sequencer-step', callback),
  onClockStep: (callback: (globalStep: number) => void): Promise<UnlistenFn> => subscribe('sequencer-clock-step', callback),
  onLfoLevels: (callback: (levels: Record<LfoId, number>) => void): Promise<UnlistenFn> => subscribe('lfo-levels', callback),
  onStopped: (callback: () => void): Promise<UnlistenFn> => subscribe('sequencer-stopped', callback)
}

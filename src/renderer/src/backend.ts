import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
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

export const backend = {
  listOutputs: (): Promise<string[]> => call('list_outputs'),
  getStatus: (): Promise<EngineStatus> => call('get_status'),
  selectOutput: (target: RackTarget, port: number | null): Promise<void> => call('select_output', { target, port }),
  configure: (config: SequencerConfig): Promise<void> => call('configure', { config }),
  setMacros: (trackId: TrackId, tone: number, space: number): Promise<void> => call('set_macros', { trackId, tone, space }),
  start: (): Promise<void> => call('start_transport'),
  stop: (): Promise<void> => call('stop_transport'),
  generateSeed: (settings: SeedSettings, variation: number): Promise<GeneratedSeed> => call('generate_seed', { settings, variation }),
  saveLabSession: (sessionId: string, contents: string): Promise<string> => call('save_lab_session', { sessionId, contents }),
  onStep: (callback: (steps: Partial<Record<TrackId, number>>) => void): Promise<UnlistenFn> => subscribe('sequencer-step', callback),
  onLfoLevels: (callback: (levels: Record<LfoId, number>) => void): Promise<UnlistenFn> => subscribe('lfo-levels', callback),
  onStopped: (callback: () => void): Promise<UnlistenFn> => subscribe('sequencer-stopped', callback)
}

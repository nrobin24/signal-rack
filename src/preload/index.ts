import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('midi', {
  listOutputs: (): Promise<string[]> => ipcRenderer.invoke('midi:list-outputs'),
  getStatus: (): Promise<{ playing: boolean; outputNames: Record<string, string | null> }> => ipcRenderer.invoke('midi:status'),
  selectOutput: (target: string, port: number | null): Promise<void> => ipcRenderer.invoke('midi:select-output', target, port),
  configure: (config: unknown): Promise<void> => ipcRenderer.invoke('sequencer:configure', config),
  setMacros: (trackId: string, tone: number, space: number): Promise<void> => ipcRenderer.invoke('sequencer:set-macros', trackId, tone, space),
  start: (): Promise<void> => ipcRenderer.invoke('sequencer:start'),
  stop: (): Promise<void> => ipcRenderer.invoke('sequencer:stop'),
  onStep: (callback: (steps: Record<string, number>) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, steps: Record<string, number>) => callback(steps)
    ipcRenderer.on('sequencer:step', listener)
    return () => ipcRenderer.removeListener('sequencer:step', listener)
  },
  onStopped: (callback: () => void): (() => void) => {
    const listener = () => callback()
    ipcRenderer.on('sequencer:stopped', listener)
    return () => ipcRenderer.removeListener('sequencer:stopped', listener)
  }
})

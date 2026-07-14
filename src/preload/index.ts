import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('midi', {
  listOutputs: (): Promise<string[]> => ipcRenderer.invoke('midi:list-outputs'),
  getStatus: (): Promise<{ playing: boolean; outputName: string | null }> => ipcRenderer.invoke('midi:status'),
  selectOutput: (port: number): Promise<void> => ipcRenderer.invoke('midi:select-output', port),
  configure: (config: unknown): Promise<void> => ipcRenderer.invoke('sequencer:configure', config),
  start: (): Promise<void> => ipcRenderer.invoke('sequencer:start'),
  stop: (): Promise<void> => ipcRenderer.invoke('sequencer:stop'),
  onStep: (callback: (step: number) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, step: number) => callback(step)
    ipcRenderer.on('sequencer:step', listener)
    return () => ipcRenderer.removeListener('sequencer:step', listener)
  },
  onStopped: (callback: () => void): (() => void) => {
    const listener = () => callback()
    ipcRenderer.on('sequencer:stopped', listener)
    return () => ipcRenderer.removeListener('sequencer:stopped', listener)
  }
})

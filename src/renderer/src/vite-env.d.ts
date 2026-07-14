/// <reference types="vite/client" />

declare global {
  interface Window {
    midi: {
      listOutputs(): Promise<string[]>
      getStatus(): Promise<{ playing: boolean; outputNames: Record<string, string | null> }>
      selectOutput(target: string, port: number | null): Promise<void>
      configure(config: unknown): Promise<void>
      setMacros(trackId: string, tone: number, space: number): Promise<void>
      start(): Promise<void>
      stop(): Promise<void>
      onStep(callback: (steps: Record<string, number>) => void): () => void
      onStopped(callback: () => void): () => void
    }
  }
}

export {}

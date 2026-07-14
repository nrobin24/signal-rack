/// <reference types="vite/client" />

declare global {
  interface Window {
    midi: {
      listOutputs(): Promise<string[]>
      getStatus(): Promise<{ playing: boolean; outputName: string | null }>
      selectOutput(port: number): Promise<void>
      configure(config: unknown): Promise<void>
      start(): Promise<void>
      stop(): Promise<void>
      onStep(callback: (step: number) => void): () => void
      onStopped(callback: () => void): () => void
    }
  }
}

export {}

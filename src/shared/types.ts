export type RackTarget = 'digitone' | 'digitakt'
export type DigitoneTrackId = 'dn-bass' | 'dn-vamp' | 'dn-puncture'
export type DigitaktTrackId =
  | 'dk-kick'
  | 'dk-snare'
  | 'dk-closed-hat'
  | 'dk-open-hat'
  | 'dk-rim'
  | 'dk-clap'
  | 'dk-texture'
export type TrackId = DigitoneTrackId | DigitaktTrackId
export type Groove = 'straight' | 'push' | 'late' | 'broken'
export type SceneId = 'full' | 'bass' | 'space' | 'drop'
export type LfoId = 'lfo-1' | 'lfo-2' | 'lfo-3' | 'lfo-4'
export type LfoShape = 'sine' | 'triangle' | 'square' | 'ramp-up' | 'ramp-down' | 'random'
export type LfoPeriod = 'quarter' | 'half' | 'bar-1' | 'bars-2' | 'bars-4' | 'bars-8' | 'bars-16' | 'bars-32'

export type LfoConfig = {
  id: LfoId
  shape: LfoShape
  period: LfoPeriod
}

export type Step = {
  notes: number[]
  velocity: number
  gate: number
  probability: number
}

export type TrackConfig = {
  id: TrackId
  target: RackTarget
  channel: number
  length: number
  groove: Groove
  muted: boolean
  tone?: number
  space?: number
  toneLfo?: LfoId
  spaceLfo?: LfoId
  toneLfoDepth?: number
  spaceLfoDepth?: number
  steps: Step[]
}

export type SequencerConfig = {
  bpm: number
  scene: SceneId
  lfos: LfoConfig[]
  tracks: TrackConfig[]
}

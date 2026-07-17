export type RackTarget = 'digitone' | 'digitakt'
export type GeneratorTarget = 'all' | 'all-digitone' | 'all-digitakt' | TrackId
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
export type DigitaktSceneId = 'full' | 'core' | 'tops' | 'drop'
export type LfoId = 'lfo-1' | 'lfo-2' | 'lfo-3' | 'lfo-4' | 'lfo-5' | 'lfo-6' | 'lfo-7' | 'lfo-8'
export type LfoShape = 'sine' | 'triangle' | 'square' | 'ramp-up' | 'ramp-down' | 'random' | 'drawn'
export type LfoPeriod = 'quarter' | 'half' | 'bar-1' | 'bars-2' | 'bars-4' | 'bars-8' | 'bars-16' | 'bars-32' | 'bars-64' | 'bars-128'

export type LfoPoint = {
  x: number
  y: number
}

export type LfoConfig = {
  id: LfoId
  shape: LfoShape
  period: LfoPeriod
  points?: LfoPoint[]
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
  toneEnabled?: boolean
  spaceEnabled?: boolean
  toneLfo?: LfoId
  spaceLfo?: LfoId
  octaveLfo?: LfoId
  toneLfoDepth?: number
  spaceLfoDepth?: number
  octaveLfoDepth?: number
  steps: Step[]
}

export type SequencerConfig = {
  bpm: number
  scene: SceneId
  digitaktScene: DigitaktSceneId
  lfos: LfoConfig[]
  tracks: TrackConfig[]
}

import type { Groove, Step, TrackId } from '../../shared/types'

export type HarmonyColor =
  | 'dorian'
  | 'house'
  | 'jazz-funk'
  | 'open'
  | 'phrygian-dyads'
  | 'detroit-dorian'
  | 'noir-phrygian'
  | 'rave-major'
  | 'warehouse-minor'
  | 'aquatic-minor'
  | 'darkcore-minor'
export type BassRole = 'anchor' | 'answer' | 'roam' | 'holes' | 'minor-driver' | 'jazz-walk' | 'semitone' | 'monolith'
export type RhythmConcept =
  | 'broken'
  | 'house'
  | 'footwork'
  | 'dub'
  | 'jungle'
  | 'uk-bass'
  | 'brazilian'
  | 'electro'
  | 'two-step'
  | 'human-house'
  | 'chopped-breaks'
  | 'dusty-boom-bap'
  | 'warehouse'
  | 'aquatic-electro'
  | 'darkcore-jungle'
export type Energy = 'low' | 'medium' | 'high'
export type PhraseShape = 'aa-turn' | 'question-answer' | 'event-space' | 'call-challenge'
export type PhraseLeader = 'pulse' | 'bass' | 'harmony' | 'texture'
export type CycleMode = 'auto' | 'locked' | 'poly'

export type SeedSettings = {
  root: number
  harmony: HarmonyColor
  bassRole: BassRole
  rhythm: RhythmConcept
  energy: Energy
  shape: PhraseShape
  leader: PhraseLeader
  cycleMode: CycleMode
}

export type GeneratedSeed = {
  tracks: Array<{
    id: TrackId
    length: number
    groove: Groove
    steps: Step[]
    tone?: number
    space?: number
  }>
  summary: string
}

export type PhrasePresetId =
  | 'pangaea-router'
  | 'moodymann-black-mahogani'
  | 'photek-hidden-camera'
  | 'lone-meeker-warm-energy'
  | 'lfo-leeds-warehouse'
  | 'drexciya-andreaen-sand-dunes'
  | 'back-2-basics-fighting-vipers'

export type PhrasePreset = {
  id: PhrasePresetId
  label: string
  bpm: number
  settings: SeedSettings
}

export const rootLabels = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
export const harmonyLabels: Record<HarmonyColor, string> = {
  dorian: 'Dorian smoke',
  house: 'Warm house',
  'jazz-funk': 'Jazz-funk',
  open: 'Open fourths',
  'phrygian-dyads': 'Phrygian power dyads',
  'detroit-dorian': 'Detroit Dorian extensions',
  'noir-phrygian': 'Noir Phrygian ninths',
  'rave-major': 'Dream-rave major',
  'warehouse-minor': 'Warehouse minor bleeps',
  'aquatic-minor': 'Aquatic Aeolian fifths',
  'darkcore-minor': 'Darkcore open fifths'
}
export const bassRoleLabels: Record<BassRole, string> = {
  anchor: 'Anchor',
  answer: 'Answer',
  roam: 'Roam',
  holes: 'Leave holes',
  'minor-driver': 'Root / minor-third driver',
  'jazz-walk': 'Jazz walk',
  semitone: 'Root / flat-two slide',
  monolith: 'Root monolith'
}
export const rhythmLabels: Record<RhythmConcept, string> = {
  broken: 'Broken pocket',
  house: 'House interlock',
  footwork: 'Footwork pressure',
  dub: 'Dub negative space',
  jungle: 'Jungle launch',
  'uk-bass': 'UK bass asymmetry',
  brazilian: 'Brazilian interlock',
  electro: 'Electro machine rule',
  'two-step': 'Triplet two-step',
  'human-house': 'Human Detroit house',
  'chopped-breaks': 'Clinical chopped breaks',
  'dusty-boom-bap': 'Dusty MPC boom-bap',
  warehouse: 'Rigid warehouse machine',
  'aquatic-electro': 'Aquatic 808 electro',
  'darkcore-jungle': 'Darkcore jungle roll'
}
export const phraseShapeLabels: Record<PhraseShape, string> = { 'aa-turn': 'A · A′ · B · turn', 'question-answer': '2-bar question / answer', 'event-space': 'Event · consequence · space · return', 'call-challenge': 'Call · pressure · break · challenge' }
export const phraseLeaderLabels: Record<PhraseLeader, string> = { pulse: 'Drums lead', bass: 'Bass leads', harmony: 'Harmony leads', texture: 'Texture leads' }

export const phrasePresets: PhrasePreset[] = [
  {
    id: 'pangaea-router',
    label: 'Pangaea — Router',
    bpm: 138,
    settings: { root: 2, harmony: 'phrygian-dyads', bassRole: 'minor-driver', rhythm: 'two-step', energy: 'high', shape: 'question-answer', leader: 'bass', cycleMode: 'poly' }
  },
  {
    id: 'moodymann-black-mahogani',
    label: 'Moodymann — Black Mahogani',
    bpm: 124,
    settings: { root: 6, harmony: 'detroit-dorian', bassRole: 'jazz-walk', rhythm: 'human-house', energy: 'medium', shape: 'aa-turn', leader: 'harmony', cycleMode: 'poly' }
  },
  {
    id: 'photek-hidden-camera',
    label: 'Photek — The Hidden Camera',
    bpm: 170,
    settings: { root: 7, harmony: 'noir-phrygian', bassRole: 'semitone', rhythm: 'chopped-breaks', energy: 'high', shape: 'call-challenge', leader: 'pulse', cycleMode: 'poly' }
  },
  {
    id: 'lone-meeker-warm-energy',
    label: 'Lone — Meeker Warm Energy',
    bpm: 94,
    settings: { root: 8, harmony: 'rave-major', bassRole: 'jazz-walk', rhythm: 'dusty-boom-bap', energy: 'medium', shape: 'aa-turn', leader: 'harmony', cycleMode: 'auto' }
  },
  {
    id: 'lfo-leeds-warehouse',
    label: 'LFO — LFO (Leeds Warehouse Mix)',
    bpm: 125,
    settings: { root: 0, harmony: 'warehouse-minor', bassRole: 'monolith', rhythm: 'warehouse', energy: 'high', shape: 'event-space', leader: 'pulse', cycleMode: 'locked' }
  },
  {
    id: 'drexciya-andreaen-sand-dunes',
    label: 'Drexciya — Andreaen Sand Dunes',
    bpm: 128,
    settings: { root: 4, harmony: 'aquatic-minor', bassRole: 'minor-driver', rhythm: 'aquatic-electro', energy: 'high', shape: 'call-challenge', leader: 'bass', cycleMode: 'poly' }
  },
  {
    id: 'back-2-basics-fighting-vipers',
    label: 'Back 2 Basics — Fighting Vipers',
    bpm: 164,
    settings: { root: 4, harmony: 'darkcore-minor', bassRole: 'minor-driver', rhythm: 'darkcore-jungle', energy: 'high', shape: 'event-space', leader: 'pulse', cycleMode: 'poly' }
  }
]

export function phrasePresetFor(settings: SeedSettings, bpm: number): PhrasePreset | undefined {
  return phrasePresets.find((preset) => preset.bpm === bpm && Object.entries(preset.settings).every(([key, value]) => settings[key as keyof SeedSettings] === value))
}

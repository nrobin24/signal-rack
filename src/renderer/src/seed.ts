import type { Groove, Step, TrackId } from '../../shared/types'

export type HarmonyColor = 'dorian' | 'house' | 'jazz-funk' | 'open'
export type BassRole = 'anchor' | 'answer' | 'roam' | 'holes'
export type RhythmConcept = 'broken' | 'house' | 'footwork' | 'dub'
export type Energy = 'low' | 'medium' | 'high'

export type SeedSettings = {
  root: number
  harmony: HarmonyColor
  bassRole: BassRole
  rhythm: RhythmConcept
  energy: Energy
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

export const rootLabels = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
export const harmonyLabels: Record<HarmonyColor, string> = { dorian: 'Dorian smoke', house: 'Warm house', 'jazz-funk': 'Jazz-funk', open: 'Open fourths' }
export const bassRoleLabels: Record<BassRole, string> = { anchor: 'Anchor', answer: 'Answer', roam: 'Roam', holes: 'Leave holes' }
export const rhythmLabels: Record<RhythmConcept, string> = { broken: 'Broken pocket', house: 'House interlock', footwork: 'Footwork skip', dub: 'Dub negative space' }

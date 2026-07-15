import type { Groove, Step, TrackId } from '../../shared/types'

export type HarmonyColor = 'dorian' | 'house' | 'jazz-funk' | 'open'
export type BassRole = 'anchor' | 'answer' | 'roam' | 'holes'
export type RhythmConcept = 'broken' | 'house' | 'footwork' | 'dub' | 'jungle' | 'uk-bass' | 'brazilian' | 'electro'
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

export const rootLabels = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
export const harmonyLabels: Record<HarmonyColor, string> = { dorian: 'Dorian smoke', house: 'Warm house', 'jazz-funk': 'Jazz-funk', open: 'Open fourths' }
export const bassRoleLabels: Record<BassRole, string> = { anchor: 'Anchor', answer: 'Answer', roam: 'Roam', holes: 'Leave holes' }
export const rhythmLabels: Record<RhythmConcept, string> = { broken: 'Broken pocket', house: 'House interlock', footwork: 'Footwork pressure', dub: 'Dub negative space', jungle: 'Jungle launch', 'uk-bass': 'UK bass asymmetry', brazilian: 'Brazilian interlock', electro: 'Electro machine rule' }
export const phraseShapeLabels: Record<PhraseShape, string> = { 'aa-turn': 'A · A′ · B · turn', 'question-answer': '2-bar question / answer', 'event-space': 'Event · consequence · space · return', 'call-challenge': 'Call · pressure · break · challenge' }
export const phraseLeaderLabels: Record<PhraseLeader, string> = { pulse: 'Drums lead', bass: 'Bass leads', harmony: 'Harmony leads', texture: 'Texture leads' }

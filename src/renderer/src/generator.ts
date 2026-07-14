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

export type GeneratedTrack = {
  id: TrackId
  length: number
  groove: Groove
  steps: Step[]
  tone?: number
  space?: number
}

export type GeneratedSeed = {
  tracks: GeneratedTrack[]
  summary: string
}

export const rootLabels = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
export const harmonyLabels: Record<HarmonyColor, string> = { dorian: 'Dorian smoke', house: 'Warm house', 'jazz-funk': 'Jazz-funk', open: 'Open fourths' }
export const bassRoleLabels: Record<BassRole, string> = { anchor: 'Anchor', answer: 'Answer', roam: 'Roam', holes: 'Leave holes' }
export const rhythmLabels: Record<RhythmConcept, string> = { broken: 'Broken pocket', house: 'House interlock', footwork: 'Footwork skip', dub: 'Dub negative space' }

type RhythmTemplate = {
  kick: number[]
  snare: number[]
  closedHat: number[]
  openHat: number[]
  rim: number[]
  clap: number[]
  texture: number[]
  bass: number[]
  vamp: number[]
  puncture: number[]
  bassLength: number
  bassGroove: Groove
  vampGroove: Groove
  punctureGroove: Groove
}

const rhythms: Record<RhythmConcept, RhythmTemplate> = {
  broken: {
    kick: [0, 3, 7, 10], snare: [4, 11], closedHat: [2, 5, 6, 9, 13, 15], openHat: [6, 14], rim: [3, 10, 14], clap: [4, 12], texture: [7, 14],
    bass: [0, 3, 6, 10, 13], vamp: [2, 7, 10, 14], puncture: [3, 8, 11, 15],
    bassLength: 14, bassGroove: 'push', vampGroove: 'late', punctureGroove: 'broken'
  },
  house: {
    kick: [0, 4, 8, 12], snare: [4, 12], closedHat: [0, 2, 4, 6, 8, 10, 12, 14], openHat: [2, 6, 10, 14], rim: [3, 11], clap: [4, 12], texture: [7, 15],
    bass: [0, 3, 6, 8, 11, 14], vamp: [2, 6, 10, 14], puncture: [7, 15],
    bassLength: 16, bassGroove: 'straight', vampGroove: 'late', punctureGroove: 'late'
  },
  footwork: {
    kick: [0, 3, 7, 10, 14], snare: [4, 12], closedHat: [2, 3, 6, 7, 10, 11, 14, 15], openHat: [7, 15], rim: [5, 9, 13], clap: [4, 12, 15], texture: [5, 13, 15],
    bass: [0, 5, 7, 10], vamp: [0, 5, 11, 14], puncture: [3, 6, 9, 13, 15],
    bassLength: 12, bassGroove: 'broken', vampGroove: 'straight', punctureGroove: 'push'
  },
  dub: {
    kick: [0, 7, 10], snare: [4, 12], closedHat: [2, 6, 10, 14], openHat: [6, 14], rim: [3, 11], clap: [12], texture: [11],
    bass: [0, 6, 9], vamp: [0, 6, 12], puncture: [5, 11, 15],
    bassLength: 10, bassGroove: 'late', vampGroove: 'late', punctureGroove: 'broken'
  }
}

const chordShapes: Record<HarmonyColor, number[][]> = {
  dorian: [[0, 3, 7, 10], [5, 9, 12, 16], [10, 14, 17, 21]],
  house: [[0, 3, 7, 10], [10, 14, 17, 21], [5, 8, 12, 15]],
  'jazz-funk': [[0, 3, 7, 10], [2, 5, 9, 12], [5, 9, 12, 15]],
  open: [[0, 5, 10, 15], [2, 7, 12, 17], [5, 10, 15, 19]]
}

const bassMotifs: Record<BassRole, number[]> = {
  anchor: [0, 0, 7, 0, 10, 0],
  answer: [0, 7, 10, 5, 3, 7],
  roam: [0, 3, 5, 9, 10, 7],
  holes: [0, 10, 0, 7]
}

export function generateSeed(settings: SeedSettings, variation: number): GeneratedSeed {
  const random = createRandom(`${settings.root}-${settings.harmony}-${settings.bassRole}-${settings.rhythm}-${settings.energy}-${variation}`)
  const rhythm = rhythms[settings.rhythm]
  const probability = settings.energy === 'low' ? 78 : settings.energy === 'high' ? 100 : 92
  const rootBass = 36 + settings.root
  const rootChord = 48 + settings.root
  const chords = chordShapes[settings.harmony].map((shape) => shape.map((offset) => rootChord + offset))
  const bassPitches = bassMotifs[settings.bassRole].map((offset) => rootBass + offset)

  const bassPositions = vary(rhythm.bass.filter((_, index) => settings.bassRole !== 'holes' || index % 2 === 0), settings.energy, random)
  const vampPositions = vary(rhythm.vamp, settings.energy, random)
  const puncturePositions = vary(rhythm.puncture, settings.energy, random)
  const puncturePitches = chords.flatMap((chord) => chord.slice(-2)).map((note) => note + 12)

  const tracks: GeneratedTrack[] = [
    {
      id: 'dn-bass', length: rhythm.bassLength, groove: rhythm.bassGroove,
      tone: settings.harmony === 'open' ? 52 : 64, space: settings.rhythm === 'dub' ? 38 : 18,
      steps: pitchedSteps(bassPositions, bassPitches, 108, 58, probability)
    },
    {
      id: 'dn-vamp', length: 16, groove: rhythm.vampGroove,
      tone: settings.harmony === 'jazz-funk' ? 82 : 72, space: settings.rhythm === 'dub' ? 86 : 62,
      steps: chordSteps(vampPositions, chords, 84, settings.rhythm === 'house' ? 42 : 72, probability)
    },
    {
      id: 'dn-puncture', length: settings.rhythm === 'footwork' ? 12 : 16, groove: rhythm.punctureGroove,
      tone: 96, space: settings.rhythm === 'dub' ? 92 : 48,
      steps: pitchedSteps(puncturePositions, puncturePitches, 76, 24, settings.energy === 'high' ? 82 : 66)
    },
    drumTrack('dk-kick', vary(rhythm.kick, settings.energy, random, true), 116, 34, probability, rhythm.bassGroove),
    drumTrack('dk-snare', vary(rhythm.snare, settings.energy, random, true), 104, 28, probability, rhythm.vampGroove),
    drumTrack('dk-closed-hat', vary(rhythm.closedHat, settings.energy, random), 84, 18, settings.energy === 'low' ? 72 : 92, rhythm.punctureGroove),
    drumTrack('dk-open-hat', vary(rhythm.openHat, settings.energy, random), 90, 68, settings.energy === 'low' ? 58 : 88, 'late'),
    drumTrack('dk-rim', vary(rhythm.rim, settings.energy, random), 92, 22, settings.energy === 'low' ? 66 : 90, rhythm.bassGroove),
    drumTrack('dk-clap', vary(rhythm.clap, settings.energy, random, true), 102, 36, settings.energy === 'low' ? 82 : 100, rhythm.vampGroove),
    drumTrack('dk-texture', vary(rhythm.texture, settings.energy, random), 76, 46, settings.energy === 'high' ? 88 : 68, 'broken')
  ]

  return {
    tracks,
    summary: `${rootLabels[settings.root]} · ${harmonyLabels[settings.harmony]} · ${rhythmLabels[settings.rhythm]} · ${bassRoleLabels[settings.bassRole]} bass · ${settings.energy} energy`
  }
}

function emptySteps(): Step[] {
  return Array.from({ length: 16 }, () => ({ notes: [], velocity: 100, gate: 50, probability: 100 }))
}

function pitchedSteps(positions: number[], pitches: number[], velocity: number, gate: number, probability: number): Step[] {
  const steps = emptySteps()
  positions.forEach((position, index) => {
    steps[position] = { notes: [pitches[index % pitches.length]], velocity: index === 0 ? Math.min(127, velocity + 8) : velocity, gate, probability }
  })
  return steps
}

function chordSteps(positions: number[], chords: number[][], velocity: number, gate: number, probability: number): Step[] {
  const steps = emptySteps()
  positions.forEach((position, index) => { steps[position] = { notes: chords[index % chords.length], velocity, gate, probability } })
  return steps
}

function drumTrack(id: TrackId, positions: number[], velocity: number, gate: number, probability: number, groove: Groove): GeneratedTrack {
  const steps = emptySteps()
  positions.forEach((position, index) => { steps[position] = { notes: [60], velocity: index === 0 ? Math.min(127, velocity + 7) : velocity, gate, probability } })
  return { id, length: 16, groove, steps }
}

function vary(source: number[], energy: Energy, random: () => number, preserveFirst = false): number[] {
  let result = [...source]
  if (energy === 'low' && result.length > 2) result = result.filter((_, index) => index % 3 !== 2)
  if (energy === 'high') {
    const additions = source.length > 5 ? 2 : 1
    for (let index = 0; index < additions; index += 1) result.push(Math.floor(random() * 16))
  }
  if (result.length > 2 && random() > 0.45) {
    const movableIndex = preserveFirst ? 1 + Math.floor(random() * (result.length - 1)) : Math.floor(random() * result.length)
    result[movableIndex] = (result[movableIndex] + (random() > 0.5 ? 1 : 15)) % 16
  }
  return [...new Set(result)].sort((a, b) => a - b)
}

function createRandom(seed: string): () => number {
  let value = 2166136261
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619)
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ next >>> 15, next | 1)
    next ^= next + Math.imul(next ^ next >>> 7, next | 61)
    return ((next ^ next >>> 14) >>> 0) / 4294967296
  }
}

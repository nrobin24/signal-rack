import type { GeneratorTarget, Step } from '../../shared/types'

export type EuclideanSettings = {
  trackId: GeneratorTarget
  hits: number
  steps: number
  rotation: number
}

export type EuclideanPreset = {
  id: string
  label: string
  context: string
  hits: number
  steps: number
  rotation: number
}

export const euclideanPresets: EuclideanPreset[] = [
  { id: 'four-floor', label: 'FOUR FLOOR', context: 'HOUSE / TECHNO', hits: 4, steps: 16, rotation: 0 },
  { id: 'tresillo', label: 'TRESILLO', context: 'CUBAN / AFRO-CUBAN', hits: 3, steps: 8, rotation: 0 },
  { id: 'cinquillo', label: 'CINQUILLO', context: 'CUBAN / WEST AFRICAN', hits: 5, steps: 8, rotation: 0 },
  { id: 'venda', label: 'VENDA', context: 'SOUTHERN AFRICAN', hits: 5, steps: 12, rotation: 0 },
  { id: 'bembe', label: 'BEMBÉ', context: 'AFRICAN 12/8', hits: 7, steps: 12, rotation: 0 },
  { id: 'bossa', label: 'BOSSA CELL', context: 'BOSSA NOVA', hits: 5, steps: 16, rotation: 0 },
  { id: 'samba', label: 'SAMBA CELL', context: 'BRAZILIAN SAMBA', hits: 7, steps: 16, rotation: 0 },
  { id: 'odd-five', label: 'ODD FIVE', context: 'SPARSE 5-STEP CELL', hits: 2, steps: 5, rotation: 0 },
  { id: 'odd-seven', label: 'ODD SEVEN', context: 'ASYMMETRIC 7-STEP CELL', hits: 3, steps: 7, rotation: 0 },
  { id: 'aksak', label: 'AKSAK', context: 'ASYMMETRIC 9-STEP CELL', hits: 4, steps: 9, rotation: 0 },
  { id: 'sparse-eleven', label: 'SPARSE 11', context: 'OPEN 11-STEP CELL', hits: 4, steps: 11, rotation: 0 },
  { id: 'dense-sixteen', label: 'DENSE 16', context: 'BUSY HAT OR MELODY CELL', hits: 9, steps: 16, rotation: 0 }
]

export function euclideanPattern(hitsInput: number, stepsInput: number, rotationInput = 0): boolean[] {
  const steps = Math.max(2, Math.min(64, Math.round(stepsInput)))
  const hits = Math.max(1, Math.min(steps, Math.round(hitsInput)))
  const rotation = ((Math.round(rotationInput) % steps) + steps) % steps
  if (hits === steps) return Array.from({ length: steps }, () => true)

  const counts: number[] = []
  const remainders: number[] = [hits]
  let divisor = steps - hits
  let level = 0

  while (remainders[level] > 1) {
    counts[level] = Math.floor(divisor / remainders[level])
    remainders[level + 1] = divisor % remainders[level]
    divisor = remainders[level]
    level += 1
  }
  counts[level] = divisor

  const pattern: boolean[] = []
  const build = (nextLevel: number): void => {
    if (nextLevel === -1) { pattern.push(false); return }
    if (nextLevel === -2) { pattern.push(true); return }
    for (let index = 0; index < counts[nextLevel]; index += 1) build(nextLevel - 1)
    if (remainders[nextLevel] !== 0) build(nextLevel - 2)
  }
  build(level)

  const firstHit = pattern.indexOf(true)
  const normalized = firstHit > 0 ? [...pattern.slice(firstHit), ...pattern.slice(0, firstHit)] : pattern
  return normalized.map((_, index) => normalized[(index - rotation + steps) % steps])
}

export function replaceWithEuclideanSteps(source: Step[], settings: Pick<EuclideanSettings, 'hits' | 'steps' | 'rotation'>, fallbackNotes: number[]): Step[] {
  const pattern = euclideanPattern(settings.hits, settings.steps, settings.rotation)
  return source.map((step, index) => ({
    ...step,
    notes: index < pattern.length && pattern[index]
      ? nearestNotes(source, index, pattern.length, fallbackNotes)
      : []
  }))
}

function nearestNotes(source: Step[], targetIndex: number, cycleLength: number, fallbackNotes: number[]): number[] {
  const candidates = source
    .map((step, index) => ({ index, notes: step.notes }))
    .filter((candidate) => candidate.notes.length > 0)
  if (candidates.length === 0) return [...fallbackNotes]

  candidates.sort((left, right) => {
    const leftDistance = musicalDistance(left.index, targetIndex, cycleLength)
    const rightDistance = musicalDistance(right.index, targetIndex, cycleLength)
    return leftDistance - rightDistance || Math.abs(left.index - targetIndex) - Math.abs(right.index - targetIndex) || left.index - right.index
  })
  return [...candidates[0].notes]
}

function musicalDistance(sourceIndex: number, targetIndex: number, cycleLength: number): number {
  if (sourceIndex >= cycleLength) return Math.abs(sourceIndex - targetIndex) + cycleLength
  const distance = Math.abs(sourceIndex - targetIndex)
  return Math.min(distance, cycleLength - distance)
}

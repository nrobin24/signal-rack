import type { Step } from '../../shared/types'
import type { HarmonyColor } from './seed'

export type PhraseMutation = 'fifth-up' | 'fifth-down' | 'brighter' | 'darker' | 'relative-shift' | 'parallel-shift'
export type TonalMode = 'phrygian' | 'aeolian' | 'dorian' | 'mixolydian' | 'ionian' | 'lydian'

export type TonalContext = {
  root: number
  mode: TonalMode
}

export const phraseMutationLabels: Record<PhraseMutation, string> = {
  'fifth-up': 'FIFTH UP',
  'fifth-down': 'FIFTH DOWN',
  brighter: 'BRIGHTER',
  darker: 'DARKER',
  'relative-shift': 'RELATIVE SHIFT',
  'parallel-shift': 'PARALLEL SHIFT'
}

const modeOrder: TonalMode[] = ['phrygian', 'aeolian', 'dorian', 'mixolydian', 'ionian', 'lydian']
const modeIntervals: Record<TonalMode, number[]> = {
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11]
}

const positiveModulo = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor
const clampMidi = (note: number): number => Math.max(0, Math.min(127, note))
const isMajorMode = (mode: TonalMode): boolean => ['mixolydian', 'ionian', 'lydian'].includes(mode)

export function tonalContext(root: number, harmony: HarmonyColor): TonalContext {
  return {
    root: positiveModulo(root, 12),
    mode: harmony === 'house' ? 'aeolian' : 'dorian'
  }
}

export function mutationDestination(base: TonalContext, mutation: PhraseMutation): TonalContext {
  if (mutation === 'fifth-up') return { ...base, root: positiveModulo(base.root + 7, 12) }
  if (mutation === 'fifth-down') return { ...base, root: positiveModulo(base.root - 7, 12) }
  if (mutation === 'brighter' || mutation === 'darker') {
    const direction = mutation === 'brighter' ? 1 : -1
    const index = Math.max(0, Math.min(modeOrder.length - 1, modeOrder.indexOf(base.mode) + direction))
    return { ...base, mode: modeOrder[index] }
  }
  if (mutation === 'relative-shift') {
    return isMajorMode(base.mode)
      ? { root: positiveModulo(base.root - 3, 12), mode: 'aeolian' }
      : { root: positiveModulo(base.root + 3, 12), mode: 'ionian' }
  }
  return isMajorMode(base.mode) ? { ...base, mode: 'aeolian' } : { ...base, mode: 'ionian' }
}

function closestNoteWithPitchClass(note: number, pitchClass: number): number {
  const center = note - positiveModulo(note - pitchClass, 12)
  const candidates = [center - 12, center, center + 12, center + 24].filter((candidate) => candidate >= 0 && candidate <= 127)
  return candidates.reduce((closest, candidate) => Math.abs(candidate - note) < Math.abs(closest - note) ? candidate : closest)
}

function remapNote(note: number, base: TonalContext, destination: TonalContext): number {
  const sourceIntervals = modeIntervals[base.mode]
  const destinationIntervals = modeIntervals[destination.mode]
  const interval = positiveModulo(note - base.root, 12)
  const degree = sourceIntervals.indexOf(interval)
  if (degree === -1) {
    const rootDelta = positiveModulo(destination.root - base.root + 6, 12) - 6
    return clampMidi(note + rootDelta)
  }
  const pitchClass = positiveModulo(destination.root + destinationIntervals[degree], 12)
  return closestNoteWithPitchClass(note, pitchClass)
}

function mutateNotes(notes: number[], base: TonalContext, mutation: PhraseMutation): number[] {
  if (mutation === 'fifth-up') return notes.map((note) => clampMidi(note + 7))
  if (mutation === 'fifth-down') return notes.map((note) => clampMidi(note - 7))
  const destination = mutationDestination(base, mutation)
  return notes.map((note) => remapNote(note, base, destination)).sort((left, right) => left - right)
}

export function mutateSteps(steps: Step[], base: TonalContext, mutation: PhraseMutation): Step[] {
  const mutated = steps.map((step) => ({ ...step, notes: mutateNotes(step.notes, base, mutation) }))
  const changedPitch = mutated.some((step, stepIndex) => step.notes.some((note, noteIndex) => note !== steps[stepIndex].notes[noteIndex]))
  if (changedPitch || (mutation !== 'brighter' && mutation !== 'darker')) return mutated

  const registerShift = mutation === 'brighter' ? 12 : -12
  return mutated.map((step) => {
    if (!step.notes.length) return step
    if (step.notes.length === 1) return { ...step, notes: [clampMidi(step.notes[0] + registerShift)] }
    const notes = [...step.notes]
    if (mutation === 'brighter') notes[0] = clampMidi(notes[0] + 12)
    else notes[notes.length - 1] = clampMidi(notes[notes.length - 1] - 12)
    return { ...step, notes: notes.sort((left, right) => left - right) }
  })
}

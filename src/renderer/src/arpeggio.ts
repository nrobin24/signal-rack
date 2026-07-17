import type { DigitoneTrackId, Step } from '../../shared/types'

export type ArpeggioDirection = 'up' | 'down' | 'up-down' | 'random'
export type ArpeggioTriggers = 'keep' | 'every-2' | 'every-1'

export type ArpeggioSettings = {
  trackId: DigitoneTrackId
  pitchClasses: number[]
  lowOctave: number
  highOctave: number
  direction: ArpeggioDirection
  repeat: number
  triggers: ArpeggioTriggers
}

export const pitchClassLabels = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export function applyArpeggio(source: Step[], length: number, settings: ArpeggioSettings): Step[] {
  const pitches = orderedPitches(settings)
  if (pitches.length === 0) return source
  const cycle = directionCycle(pitches, settings.direction)
  let event = 0

  return source.map((step, index) => {
    if (index >= length) return step
    const active = settings.triggers === 'keep'
      ? step.notes.length > 0
      : settings.triggers === 'every-1' || index % 2 === 0
    if (!active) return { ...step, notes: [] }

    const repeatedEvent = Math.floor(event / Math.max(1, settings.repeat))
    const note = settings.direction === 'random'
      ? cycle[stableRandomIndex(repeatedEvent, cycle.length)]
      : cycle[repeatedEvent % cycle.length]
    event += 1
    return { ...step, notes: [note] }
  })
}

export function phrasePitchClasses(tracks: Array<{ id: string; steps: Step[] }>, root: number): number[] {
  const priority = ['dn-vamp', 'dn-bass', 'dn-puncture']
  const classes: number[] = []
  for (const id of priority) {
    const track = tracks.find((candidate) => candidate.id === id)
    for (const step of track?.steps ?? []) {
      for (const note of step.notes) {
        const pitchClass = ((note % 12) + 12) % 12
        if (!classes.includes(pitchClass)) classes.push(pitchClass)
      }
    }
  }
  if (classes.length < 3) return [0, 2, 3, 5, 7, 9, 10].map((interval) => (root + interval) % 12)
  return classes.sort((left, right) => left - right).slice(0, 8)
}

function orderedPitches(settings: ArpeggioSettings): number[] {
  const low = Math.min(settings.lowOctave, settings.highOctave)
  const high = Math.max(settings.lowOctave, settings.highOctave)
  const classes = [...new Set(settings.pitchClasses.map((note) => ((note % 12) + 12) % 12))].sort((left, right) => left - right)
  const pitches: number[] = []
  for (let octave = low; octave <= high; octave += 1) {
    for (const pitchClass of classes) {
      const note = (octave + 1) * 12 + pitchClass
      if (note <= 127) pitches.push(note)
    }
  }
  return pitches
}

function directionCycle(pitches: number[], direction: ArpeggioDirection): number[] {
  if (direction === 'down') return [...pitches].reverse()
  if (direction === 'up-down' && pitches.length > 2) return [...pitches, ...pitches.slice(1, -1).reverse()]
  return pitches
}

function stableRandomIndex(event: number, length: number): number {
  const mixed = Math.imul(event + 1, 1103515245) + 12345
  return Math.abs(mixed >>> 8) % length
}

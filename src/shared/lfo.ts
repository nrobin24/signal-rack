import type { LfoConfig, LfoPeriod } from './types'

export const lfoPeriodLabels: Record<LfoPeriod, string> = {
  quarter: '1/4 NOTE',
  half: '1/2 NOTE',
  'bar-1': '1 BAR',
  'bars-2': '2 BARS',
  'bars-4': '4 BARS',
  'bars-8': '8 BARS',
  'bars-16': '16 BARS',
  'bars-32': '32 BARS'
}

const periodPulses: Record<LfoPeriod, number> = {
  quarter: 24,
  half: 48,
  'bar-1': 96,
  'bars-2': 192,
  'bars-4': 384,
  'bars-8': 768,
  'bars-16': 1536,
  'bars-32': 3072
}

export function lfoValue(lfo: LfoConfig, pulse: number): number {
  const pulses = periodPulses[lfo.period]
  const phase = (pulse % pulses) / pulses

  if (lfo.shape === 'sine') return Math.sin(phase * Math.PI * 2)
  if (lfo.shape === 'triangle') return 1 - 4 * Math.abs(phase - 0.5)
  if (lfo.shape === 'square') return phase < 0.5 ? 1 : -1
  if (lfo.shape === 'ramp-up') return phase * 2 - 1
  if (lfo.shape === 'ramp-down') return 1 - phase * 2
  return randomCycleValue(lfo.id, Math.floor(pulse / pulses))
}

export function modulatedValue(base: number, lfo: LfoConfig | undefined, pulse: number): number {
  const modulation = lfo ? lfoValue(lfo, pulse) * lfo.depth : 0
  return Math.max(0, Math.min(127, base + modulation))
}

function randomCycleValue(id: string, cycle: number): number {
  let value = 2166136261
  for (const character of `${id}-${cycle}`) value = Math.imul(value ^ character.charCodeAt(0), 16777619)
  value += 0x6d2b79f5
  value = Math.imul(value ^ value >>> 15, value | 1)
  value ^= value + Math.imul(value ^ value >>> 7, value | 61)
  return ((value ^ value >>> 14) >>> 0) / 2147483648 - 1
}

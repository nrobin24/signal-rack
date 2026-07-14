import { describe, expect, it } from 'vitest'
import { lfoValue, modulatedValue } from './lfo'
import type { LfoConfig } from './types'

const lfo: LfoConfig = { id: 'lfo-1', shape: 'sine', period: 'quarter', depth: 20 }

describe('lfoValue', () => {
  it('follows clock divisions and restarts at the end of a cycle', () => {
    expect(lfoValue(lfo, 0)).toBeCloseTo(0)
    expect(lfoValue(lfo, 6)).toBeCloseTo(1)
    expect(lfoValue(lfo, 12)).toBeCloseTo(0)
    expect(lfoValue(lfo, 18)).toBeCloseTo(-1)
    expect(lfoValue(lfo, 24)).toBeCloseTo(0)
  })

  it('holds random values for one complete selected period', () => {
    const random: LfoConfig = { ...lfo, id: 'lfo-4', shape: 'random', period: 'bar-1' }
    expect(lfoValue(random, 0)).toBe(lfoValue(random, 95))
    expect(lfoValue(random, 96)).not.toBe(lfoValue(random, 95))
  })

  it('uses depth around the base value and clamps to the MIDI range', () => {
    const square: LfoConfig = { ...lfo, shape: 'square', depth: 40 }
    expect(modulatedValue(64, square, 0)).toBe(104)
    expect(modulatedValue(110, square, 0)).toBe(127)
    expect(modulatedValue(10, square, 12)).toBe(0)
    expect(modulatedValue(73, undefined, 0)).toBe(73)
  })
})

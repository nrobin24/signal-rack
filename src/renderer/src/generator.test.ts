import { describe, expect, it } from 'vitest'
import { generateSeed, type SeedSettings } from './generator'

const settings: SeedSettings = { root: 2, harmony: 'dorian', bassRole: 'anchor', rhythm: 'broken', energy: 'medium' }

describe('generateSeed', () => {
  it('creates related material for all Digitone and Digitakt lanes', () => {
    const result = generateSeed(settings, 1)
    expect(result.tracks.map((track) => track.id)).toEqual([
      'dn-bass', 'dn-vamp', 'dn-puncture', 'dk-kick', 'dk-snare', 'dk-closed-hat', 'dk-open-hat', 'dk-rim', 'dk-clap', 'dk-texture'
    ])
    expect(result.tracks.every((track) => track.steps.length === 16)).toBe(true)
    expect(result.tracks.find((track) => track.id === 'dn-vamp')?.steps.some((step) => step.notes.length >= 4)).toBe(true)
    expect(result.tracks.filter((track) => track.id.startsWith('dk-')).every((track) => track.steps.some((step) => step.notes[0] === 60))).toBe(true)
  })

  it('is repeatable for the same settings and variation', () => {
    expect(generateSeed(settings, 4)).toEqual(generateSeed(settings, 4))
    expect(generateSeed(settings, 4)).not.toEqual(generateSeed(settings, 5))
  })
})

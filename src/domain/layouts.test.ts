import { describe, expect, it } from 'vitest';
import { layoutById, nearestLayout, stepLayout } from './layouts.ts';

describe('layouts', () => {
  it('falls back to 50-50', () => {
    expect(layoutById(undefined).id).toBe('50-50');
    expect(layoutById('nope').id).toBe('50-50');
  });
  it('snaps a dragged ratio to the nearest layout', () => {
    expect(nearestLayout(0.52).id).toBe('50-50');
    expect(nearestLayout(0.66).id).toBe('70-30');
    expect(nearestLayout(0.33).id).toBe('30-70');
    expect(nearestLayout(0.95).id).toBe('70-30');
  });
  it('steps between neighbours and stops at the ends', () => {
    expect(stepLayout('50-50', 1).id).toBe('60-40');
    expect(stepLayout('50-50', -1).id).toBe('40-60');
    expect(stepLayout('70-30', 1).id).toBe('70-30');
    expect(stepLayout('30-70', -1).id).toBe('30-70');
  });
  it('slide shapes go from tall to wide as the drawing side grows', () => {
    const ratios = ['70-30', '60-40', '50-50', '40-60', '30-70'].map(id => {
      const { width, height } = layoutById(id).slide;
      return width / height;
    });
    expect([...ratios].sort((a, b) => a - b)).toEqual(ratios);
  });
});

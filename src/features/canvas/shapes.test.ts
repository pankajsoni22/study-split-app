import { describe, expect, it } from 'vitest';
import { SHAPES, skeletonBounds } from './shapes.ts';

describe('shape pack', () => {
  it('has unique keys in both categories', () => {
    expect(new Set(SHAPES.map(s => s.key)).size).toBe(SHAPES.length);
    expect(SHAPES.filter(s => s.category === 'system').length).toBeGreaterThanOrEqual(10);
    expect(SHAPES.filter(s => s.category === 'data').length).toBeGreaterThanOrEqual(7);
  });

  it.each(SHAPES.map(s => [s.key, s] as const))('%s is well-formed', (_key, shape) => {
    const items = shape.build();
    expect(items.length).toBeGreaterThan(0);

    const ids = items.map(i => i.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);                       // no duplicate ids

    for (const i of items) {                                          // arrows only bind to shapes that exist
      if (i.start) expect(ids).toContain(i.start.id);
      if (i.end) expect(ids).toContain(i.end.id);
      if (i.type === 'arrow' || i.type === 'line') expect(i.points?.length).toBeGreaterThanOrEqual(2);
    }

    const b = skeletonBounds(items);                                  // fits on the smallest slide (900 wide)
    expect(b.maxX - b.minX).toBeLessThan(800);
    expect(b.maxY - b.minY).toBeLessThan(600);
  });

  it('builds fresh objects each time (inserting twice never shares state)', () => {
    const shape = SHAPES.find(s => s.key === 'binary-tree')!;
    expect(shape.build()).not.toBe(shape.build());
    expect(shape.build()[0]).not.toBe(shape.build()[0]);
  });
});

import { describe, expect, it } from 'vitest';
import { can } from './roles.ts';

describe('can', () => {
  it('lets writers and admins write', () => {
    expect(can.write('reader')).toBe(false);
    expect(can.write('writer')).toBe(true);
    expect(can.write('admin')).toBe(true);
    expect(can.write(undefined)).toBe(false);
  });
  it('only admins administer', () => {
    expect(can.admin('writer')).toBe(false);
    expect(can.admin('admin')).toBe(true);
  });
});

import type { Role } from './types.ts';

/** UI-side permission checks. The database (RLS) is the real enforcement; these only shape the UI. */
export const can = {
  write: (role: Role | undefined) => role === 'writer' || role === 'admin',
  admin: (role: Role | undefined) => role === 'admin'
} as const;

export const roleLabel: Record<Role, string> = {
  reader: 'Reader',
  writer: 'Writer',
  admin: 'Admin'
};

export const roleDescription: Record<Role, string> = {
  reader: 'Can read articles',
  writer: 'Can write and publish their own articles',
  admin: 'Full access, including every article and user'
};

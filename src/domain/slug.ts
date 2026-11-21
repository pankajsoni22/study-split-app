// Same rules as public.slugify() in supabase/migrations (keep in sync).
export function slugify(text: string): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  return s || 'untitled';
}

export const isValidSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 80;

/** Tag input → canonical tag slug ("System Design" → "system-design"); empty when nothing usable. */
export function tagSlug(text: string): string {
  const s = slugify(text);
  return s === 'untitled' ? '' : s;
}

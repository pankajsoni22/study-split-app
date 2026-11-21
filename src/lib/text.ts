/** "Pankaj Soni" → "PS", "pankaj@gmail.com" → "P". */
export function initialsOf(nameOrEmail: string | null | undefined): string {
  const name = (nameOrEmail ?? '').split('@')[0] ?? '';
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : (words[0] ?? '?').slice(0, 1)).toUpperCase();
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : '';
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
export function formatCount(n: number): string {
  return compact.format(n);
}

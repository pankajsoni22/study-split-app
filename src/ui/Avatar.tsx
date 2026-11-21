import { useState } from 'react';
import { initialsOf } from '../lib/text.ts';

/** Profile photo, falling back to initials if there is none or it fails to load. */
export default function Avatar({ name, url, className = '' }: { name: string | null | undefined; url?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`avatar ${className}`} aria-hidden="true">
      {url && !failed
        ? <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} />
        : initialsOf(name)}
    </span>
  );
}

/** The Study Split mark (same drawing as public/favicon.svg). Decorative unless `title` is given. */
export default function Logo({ size = 34, className = 'brand-mark', title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="64" height="64" rx="15" fill="#0E7C6B" />
      <path d="M32 13.5v37" stroke="#FAF7F2" strokeWidth="2.6" strokeLinecap="round" opacity=".9" />
      <g strokeLinecap="round" fill="none">
        <path d="M12.5 22.5h14" stroke="#E9A23B" strokeWidth="3.6" />
        <path d="M12.5 31h14M12.5 39.5h9.5" stroke="#FAF7F2" strokeWidth="3.2" />
      </g>
      <g fill="none" stroke="#FAF7F2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M38.6 16.4c4.3-.5 8.7-.6 13.1-.4.4 3.6.5 7.1.3 10.7-4.4.4-8.8.5-13.2.4-.3-3.6-.4-7.1-.2-10.7z" />
        <path d="M45.2 27.6c.3 2.9.2 5.6.1 8.4" />
        <path d="M42.3 33.3l2.9 3.2 2.9-3.3" />
        <path d="M45.3 40.3c2.4-.1 4.3 1.8 4.2 4.1-.1 2.3-2 4-4.3 3.9-2.2-.1-3.9-1.9-3.9-4.1.1-2.2 1.8-3.9 4-3.9z" />
      </g>
    </svg>
  );
}

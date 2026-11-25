/**
 * Dev server only: which database the app is using. "LOCAL DB" for `npm run dev`, "PROD DATA" (red) for
 * `npm run dev:prod`, so real articles are never edited by mistake. Not rendered in production builds.
 */
export default function DevBadge({ backend }: { backend: 'local' | 'hosted' }) {
  return (
    <div className={`dev-badge is-${backend}`} role="note"
      title={backend === 'local' ? 'Dev server using the local database (npm run dev)' : 'Dev server using the HOSTED production database (npm run dev:prod) — changes are real'}>
      {backend === 'local' ? 'LOCAL DB' : 'PROD DATA'}
    </div>
  );
}

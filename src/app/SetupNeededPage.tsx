import Brand from '../ui/Brand.tsx';

/** Shown instead of a broken app when .env.local / repository variables are missing. */
export default function SetupNeededPage({ missing }: { missing: string[] }) {
  return (
    <div className="onboard">
      <div className="card">
        <div className="onboard-head">
          <Brand to={null} />
          <h1>Almost there</h1>
          <p className="muted">Study Split needs a few settings before it can start.</p>
        </div>
        <p>Add these to <code>.env.local</code> (local) or the repository's Actions variables (deploy):</p>
        <ul>{missing.map(m => <li key={m}><code>{m}</code></li>)}</ul>
        <p className="muted">See README.md → “Setup” for where each value comes from.</p>
      </div>
    </div>
  );
}

import { Construction, MonitorSmartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIsNarrow } from '../../lib/useMediaQuery.ts';
import { EmptyState } from '../../ui/States.tsx';

/** Editor route. Phase 1 builds the split editor here; phones stay read-only (D9). */
export default function WritePage() {
  const narrow = useIsNarrow();
  if (narrow) {
    return (
      <EmptyState icon={MonitorSmartphone} title="Writing needs a bigger screen">
        <h1 className="visually-hidden">Editor</h1>
        <p className="muted">Study Split is read-only on phones. Open this page on a tablet or computer to write and draw.</p>
        <Link className="btn btn-ghost" to="/me/articles">Back to my articles</Link>
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={Construction} title="The split editor arrives in Phase 1">
      <h1 className="visually-hidden">Editor</h1>
      <p className="muted">Text on the left, an Excalidraw canvas on the right, frames linked to sections.</p>
      <Link className="btn btn-ghost" to="/me/articles">Back to my articles</Link>
    </EmptyState>
  );
}

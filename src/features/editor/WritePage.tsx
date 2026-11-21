import { MonitorSmartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIsNarrow } from '../../lib/useMediaQuery.ts';
import { EmptyState } from '../../ui/States.tsx';

/** Shown instead of the editor on phones (read-only below 768 px, D9). */
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
    <EmptyState icon={MonitorSmartphone} title="Opening the editor…">
      <h1 className="visually-hidden">Editor</h1>
    </EmptyState>
  );
}

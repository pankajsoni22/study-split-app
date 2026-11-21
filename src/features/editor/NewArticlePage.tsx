import { BookOpenCheck, Boxes, Code2, FileText, Lightbulb, MessagesSquare, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildTemplateDoc, TEMPLATES, type Template } from '../../domain/templates.ts';
import { errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';
import { invalidate } from '../../data/useQuery.ts';
import { useIsNarrow } from '../../lib/useMediaQuery.ts';
import WritePage from './WritePage.tsx';

const ICONS: Record<string, LucideIcon> = {
  'system-design': Boxes, 'interview-experience': MessagesSquare, 'software-project': Code2,
  dsa: BookOpenCheck, concept: Lightbulb, blank: FileText
};

/** /write/new — pick a template; it pre-fills sections and canvas frames (docs §6.5). One DB call. */
export default function NewArticlePage() {
  const navigate = useNavigate();
  const narrow = useIsNarrow();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (narrow) return <WritePage />;

  async function start(t: Template) {
    setBusy(t.key); setError('');
    try {
      const { doc } = buildTemplateDoc(t);
      const id = await getServices().articles.create({ title: t.key === 'blank' ? 'Untitled' : `Untitled ${t.name.toLowerCase()}`, templateKey: t.key, doc });
      invalidate('articles:');
      void navigate(`/write/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>New article</h1>
          <p className="page-subtitle">Pick a starting point. Sections and canvas frames are created for you, and everything stays editable.</p>
        </div>
      </header>
      {error && <p className="banner banner-error" role="alert">{error}</p>}
      <div className="template-grid">
        {TEMPLATES.map(t => {
          const Icon = ICONS[t.key] ?? FileText;
          return (
            <button key={t.key} type="button" className="card template-card" disabled={busy !== null} onClick={() => void start(t)}>
              <span className="state-icon"><Icon size={22} aria-hidden="true" /></span>
              <span className="template-name">{t.name}</span>
              <span className="template-desc">{t.description}</span>
              {t.sections.length > 0 && (
                <span className="template-sections">{t.sections.map(s => s.title).join(' · ')}</span>
              )}
              {busy === t.key && <span className="field-hint">Creating…</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

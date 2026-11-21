import { Link } from 'react-router-dom';
import Logo from './Logo.tsx';

/** Logo mark + "Study Split" wordmark ("Split" in the brand colour). */
export default function Brand({ to = '/', subtitle = 'Notes · Diagrams · Revision' }: { to?: string | null; subtitle?: string | null }) {
  const content = (
    <>
      <Logo />
      <span className="brand-text">
        <span className="brand-name">Study <b>Split</b></span>
        {subtitle && <span className="brand-sub">{subtitle}</span>}
      </span>
    </>
  );
  return to === null
    ? <div className="brand">{content}</div>
    : <Link to={to} className="brand" aria-label="Study Split home">{content}</Link>;
}

import { Link } from 'react-router-dom';
import Logo from './Logo.tsx';

export const TAGLINE = 'Split Makes Learning Easy';

/** Logo mark + "Study Split" wordmark ("Split" in the brand colour) + the tagline. */
export default function Brand({ to = '/', subtitle = TAGLINE }: { to?: string | null; subtitle?: string | null }) {
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

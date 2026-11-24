import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Notification in the corner that closes itself after `seconds`. A bar shrinks to show the time left;
 * hovering (or focusing) pauses it so there's time to click the action.
 */
export default function TimedToast({ children, action, seconds = 10, onClose }: {
  children: ReactNode;
  action?: ReactNode;
  seconds?: number;
  onClose: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const left = useRef(seconds * 1000);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => onCloseRef.current(), left.current);
    return () => { window.clearTimeout(timer); left.current -= Date.now() - started; };
  }, [paused]);

  return (
    <div className="timed-toast" role="status" aria-live="polite"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="timed-toast-body">
        <span className="timed-toast-text">{children}</span>
        {action}
        <button type="button" className="icon-btn icon-btn-plain" onClick={onClose} aria-label="Close"><X size={16} aria-hidden="true" /></button>
      </div>
      <span className="timed-toast-bar" style={{ animationDuration: `${seconds}s`, animationPlayState: paused ? 'paused' : 'running' }} aria-hidden="true" />
    </div>
  );
}

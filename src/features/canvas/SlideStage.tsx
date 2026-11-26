import type { CanvasScene } from '../../domain/types.ts';
import SlideImage from './SlideImage.tsx';

/** The drawing side for readers: the current slide, centred and scaled to fit, cross-fading on change. */
export default function SlideStage({ scene, frameId, label, only, fresh }: {
  scene: CanvasScene; frameId: string | null; label: string;
  /** Unfold: show only these parts; `fresh` ones glow in. */
  only?: ReadonlySet<string>; fresh?: ReadonlySet<string>;
}) {
  return (
    <div className="slide-stage dot-grid">
      {frameId
        ? <SlideImage key={frameId} scene={scene} frameId={frameId} label={label} className="is-stage" only={only} fresh={fresh} />
        : <p className="muted slide-empty">No drawing for this section.</p>}
    </div>
  );
}

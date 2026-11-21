import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State { error: Error | null }

/** Last-resort catch so one broken screen doesn't blank the whole app. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="state" role="alert">
        <p className="state-title">Something went wrong on this page</p>
        <p className="muted error-detail">{this.state.error.message}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}

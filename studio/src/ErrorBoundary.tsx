import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Prevent a single panel crash from blanking the entire Replay Studio. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Replay Studio]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-banner" style={{ margin: 16, padding: 16 }}>
          <strong>Something went wrong in Replay Studio.</strong>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 12 }}>
            {this.state.error.message}
          </pre>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

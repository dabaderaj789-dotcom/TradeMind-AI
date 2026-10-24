import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

/** Catches render crashes so the shell stays usable. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[TradeMind ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="font-display text-sm font-semibold text-content">
            {this.props.label ?? "Something went wrong"}
          </div>
          <p className="max-w-md text-xs text-muted">{this.state.error.message}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onReset: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info);
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div className="error-screen">
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="demo-pill">DEMO DATA</div>
          <h1>演示发生异常</h1>
          <p className="muted">{this.state.error.message}</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              this.props.onReset();
              this.setState({ error: null });
            }}
          >
            Reset Demo
          </button>
        </div>
      </div>
    );
  }
}

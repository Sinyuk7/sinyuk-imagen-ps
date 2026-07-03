import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface AppErrorBoundaryProps {
  readonly runtime: 'chrome' | 'uxp';
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly error: Error | null;
}

function errorMessageFrom(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * 兜底 React render/commit 期异常，避免单点异常导致整页白屏。
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Imagen PS ${this.props.runtime} runtime crashed`, error, info);
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        data-runtime={this.props.runtime}
        data-status="error"
        style={{
          boxSizing: 'border-box',
          minHeight: '100vh',
          padding: '16px',
          fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
          fontSize: '12px',
          lineHeight: '18px',
          color: '#e9edf4',
          background: '#0d1117',
          whiteSpace: 'pre-wrap',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '8px', color: '#f26d6d' }}>
          Imagen PS runtime failed
        </div>
        <pre
          style={{
            margin: 0,
            color: '#a6b0bf',
            whiteSpace: 'pre-wrap',
          }}
        >
          {errorMessageFrom(this.state.error)}
        </pre>
      </div>
    );
  }
}

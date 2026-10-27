'use client';
import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

function formatClientError(error: Error): string {
  return `${error.name}: ${error.message}`;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error): void {
    console.error('ErrorBoundary caught:', formatClientError(error));
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  private handleHardReset = () => {
    try {
      localStorage.removeItem('meowhook_tabs');
      localStorage.removeItem('meowhook_webhooks');
      localStorage.removeItem('meowhook_webhook_url');
      sessionStorage.removeItem('meowhook_temp_tabs');
    } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="error-boundary-backdrop">
          <div className="error-boundary-card">
            <div className="error-boundary-emoji" aria-hidden>⚠️</div>
            <h1 className="error-boundary-title">Something went wrong</h1>
            <p className="error-boundary-message">
              Meowhook encountered an unexpected error. Draft content is stored locally, but sensitive webhook URLs are not kept after reloads.
            </p>
            {this.state.error && (
              <div className="error-boundary-details">
                <button
                  type="button"
                  className="error-boundary-details__toggle"
                  onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
                >
                  {this.state.showDetails ? 'Hide details' : 'Show error details'}
                </button>
                {this.state.showDetails && (
                  <pre className="error-boundary-details__code">
                    {this.state.error.stack || this.state.error.message}
                  </pre>
                )}
              </div>
            )}
            <div className="error-boundary-actions">
              <button type="button" className="btn btn-primary" onClick={this.handleReset}>
                Try Again
              </button>
              <button type="button" className="btn btn-secondary" onClick={this.handleHardReset}>
                Reset &amp; Reload
              </button>
            </div>
            <p className="error-boundary-warning">
              Reset &amp; Reload will clear all local drafts and saved webhooks.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

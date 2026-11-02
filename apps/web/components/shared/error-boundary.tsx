'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-center">
            <p className="text-sm text-red-300">
              Something went wrong. Please try again.
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-md border border-red-700 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900/40"
            >
              Retry
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
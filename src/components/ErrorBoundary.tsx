import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#121212] flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/30 rounded-2xl p-8 shadow-xl">
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Unexpected Error In UI</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {this.state.error?.message || "Something went wrong in rendering components."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl font-semibold hover:scale-[1.02] transition-transform shadow-sm"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

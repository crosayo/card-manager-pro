import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
          <div className="bg-white p-8 rounded-xl shadow-lg max-w-lg w-full border border-red-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle size={32} />
              <h1 className="text-xl font-bold">システムエラーが発生しました</h1>
            </div>
            <p className="text-slate-600 mb-4">予期せぬエラーによりアプリケーションが停止しました。</p>
            <div className="bg-slate-900 text-slate-200 p-4 rounded text-sm font-mono overflow-auto max-h-48 mb-6">
              {this.state.error?.toString()}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white py-2 rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              ページを再読み込み
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
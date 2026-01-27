import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#1e293b',
          background: '#f8fafc',
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
            An unexpected error occurred. Please refresh the page.
          </p>
          <button
            onClick={this.handleRefresh}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '0.375rem',
              border: 'none',
              background: '#6366f1',
              color: '#fff',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Refresh Page
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre style={{
              marginTop: '2rem',
              padding: '1rem',
              background: '#1e293b',
              color: '#f87171',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
              maxWidth: '600px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {this.state.error.toString()}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

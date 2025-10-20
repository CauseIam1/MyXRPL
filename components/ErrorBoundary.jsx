import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo,
    });

    // Log error to console
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "20px",
            textAlign: "center",
            background: "linear-gradient(135deg, #1e3a5f, #0f1c2e)",
            borderRadius: "15px",
            margin: "20px",
            border: "2px solid #f87171",
          }}
        >
          <h2 style={{ color: "#f87171" }}>Something went wrong</h2>
          <p style={{ color: "#94a3b8" }}>
            Please refresh the page or report this issue on GitHub.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "linear-gradient(135deg, #27a2db, #1565c0)",
              color: "#ffffff",
              border: "none",
              padding: "10px 20px",
              borderRadius: "20px",
              cursor: "pointer",
              fontWeight: "bold",
              marginTop: "15px",
            }}
          >
            Refresh Page
          </button>
          <p
            style={{
              fontSize: "0.8rem",
              color: "#64748b",
              marginTop: "15px",
              maxWidth: "600px",
              margin: "15px auto 0",
            }}
          >
            Error: {this.state.error && this.state.error.toString()}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

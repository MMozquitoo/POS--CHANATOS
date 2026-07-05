import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Actualiza el estado para que la próxima renderización muestre la UI de error
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Registra el error en la consola
    console.error('ErrorBoundary capturó un error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
      
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          background: '#f8f9fa',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '600px',
            width: '100%',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '4rem',
              marginBottom: '1rem'
            }}>
              ⚠️
            </div>
            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              color: '#dc3545'
            }}>
              Ocurrió un error
            </h1>
            <p style={{
              color: '#666',
              marginBottom: '2rem',
              lineHeight: '1.6'
            }}>
              Algo salió mal. Por favor, recarga la página para continuar.
            </p>
            
            <button
              onClick={this.handleReload}
              style={{
                padding: '0.75rem 2rem',
                background: '#F5BB4C',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.target.style.background = '#D4A03A'}
              onMouseOut={(e) => e.target.style.background = '#F5BB4C'}
            >
              Recargar
            </button>

            {/* Sistema interno: mostrar siempre el detalle para poder diagnosticar en sitio */}
            {this.state.error && (
              <div style={{
                marginTop: '2rem',
                padding: '1rem',
                background: '#f8f9fa',
                borderRadius: '8px',
                textAlign: 'left',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
                <h3 style={{
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem',
                  color: '#333'
                }}>
                  Detalle técnico (compártelo para diagnóstico):
                </h3>
                <pre style={{
                  fontSize: '0.8rem',
                  color: '#dc3545',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0
                }}>
                  {this.state.error.toString()}
                  {isDev && this.state.errorInfo?.componentStack && (
                    <>
                      {'\n\n'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                  {!isDev && this.state.errorInfo?.componentStack && (
                    <>
                      {'\n'}
                      {this.state.errorInfo.componentStack.split('\n').slice(0, 4).join('\n')}
                    </>
                  )}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

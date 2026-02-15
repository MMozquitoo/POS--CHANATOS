import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Mas() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', paddingBottom: '80px' }}>
      <header style={{ background: 'white', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <button onClick={() => navigate('/')} className="back-btn">← Volver a Mesas</button>
        <h1 style={{ fontSize: '1.5rem' }}>MÁS</h1>
        <button onClick={logout} className="logout-btn">Salir</button>
      </header>

      <div style={{ padding: '1rem', display: 'grid', gap: '1rem' }}>
        <button className="footer-btn" onClick={() => navigate('/ventanilla', { state: { from: '/mas' } })}>
          VENTANILLA (manual)
        </button>
        <button className="footer-btn" onClick={() => navigate('/domicilios', { state: { from: '/mas' } })}>
          DOMICILIOS (manual)
        </button>
      </div>
    </div>
  );
}



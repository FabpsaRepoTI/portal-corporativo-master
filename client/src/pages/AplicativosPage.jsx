import { useNavigate } from 'react-router-dom';
import { useReveal } from '../hooks/useReveal';
import { APPS } from '../data/staticData';

export default function AplicativosPage() {
  const navigate = useNavigate();
  return (
    <div className="apps-page">
      <div className="apps-hero">
        <div className="apps-hero-glow" />
        <div className="apps-hero-grid" />
        <div className="apps-hero-inner">
          <button className="apps-back" onClick={() => navigate('/')}>
            <i className="ti ti-arrow-left" /> Volver al inicio
          </button>
          <span className="apps-eyebrow">Suite de herramientas</span>
          <h1 className="apps-title">Aplicativos <em>FABPSA</em></h1>
          <p className="apps-sub">Selecciona el sistema al que deseas acceder.</p>
        </div>
        <div className="apps-soporte">
          <i className="ti ti-headset" />
          <a href="equipoTI.php">Soporte TI</a>
        </div>
      </div>

      <div className="apps-grid-wrap">
        <div className="apps-grid">
          {APPS.map((app, i) => <AppCard key={app.id} app={app} delay={i} />)}
        </div>
      </div>
    </div>
  );
}

function AppCard({ app, delay }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`app-card reveal d${(delay % 6) + 1} ${visible ? 'visible' : ''}`}
      onClick={() => window.open(app.url, '_blank', 'noopener,noreferrer')}
    >
      <div className="app-card-topline" style={{ '--ac': app.color }} />
      <div className="app-card-body">
        <div className="app-card-icon" style={{ '--ac': app.color, '--acb': app.bg }}>
          <i className={app.icon} />
        </div>
        <div className="app-card-name">{app.name}</div>
        <span className="app-supp-lbl">Soporte</span>
        <a
          href={app.sLink}
          className="app-supp-link"
          onClick={e => e.stopPropagation()}
        >
          <i className="ti ti-user-circle" /> {app.support}
        </a>
        {app.alt && (
          <div className="app-alt">
            <a
              href={app.alt}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
            >
              <i className="ti ti-external-link" /> Acceso alterno
            </a>
          </div>
        )}
      </div>
      <div className="app-card-foot">
        <span className="app-open">Abrir <i className="ti ti-arrow-up-right" /></span>
      </div>
    </div>
  );
}

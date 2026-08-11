import { useReveal } from '../hooks/useReveal';
import { QUICK_APPS } from '../data/staticData';

export default function QuickAccess() {
  return (
    <section className="quick-access">
      <div className="sec-header">
        <span className="sec-tag">Acceso rápido</span>
      </div>
      <div className="quick-grid">
        {QUICK_APPS.map((app, i) => <QuickCard key={app.name} app={app} delay={i} />)}
      </div>
    </section>
  );
}

{/*function QuickCard({ app, delay }) {
  const { ref, visible } = useReveal();
  return (
    <button
      ref={ref}
      onClick={() => window.open(app.url, '_blank', 'noopener,noreferrer')}
      className={`quick-card reveal d${(delay % 6) + 1} ${visible ? 'visible' : ''}`}
      title={`Abrir ${app.name}`}
    >
      <div className="quick-icon"><i className={`ti ${app.icon}`} /></div>
      <span className="quick-name">{app.name}</span>
      <span className="quick-desc">{app.desc}</span>
    </button>
  );
}*/}

function QuickCard({ app, delay }) {
  const { ref, visible } = useReveal();

  const colorClass = `quick-card-${(delay % 8) + 1}`;

  return (
    <button
      ref={ref}
      onClick={() => window.open(app.url, '_blank', 'noopener,noreferrer')}
      className={`quick-card ${colorClass} reveal d${(delay % 6) + 1} ${visible ? 'visible' : ''}`}
      title={`Abrir ${app.name}`}
    >
      <div className="quick-icon">
        <i className={`ti ${app.icon}`} />
      </div>

      <span className="quick-name">{app.name}</span>
      <span className="quick-desc">{app.desc}</span>
    </button>
  );
}
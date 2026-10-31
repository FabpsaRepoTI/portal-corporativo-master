import { useNavigate } from 'react-router-dom';
import { useReveal } from '../hooks/useReveal';
import { TypeAnimation } from 'react-type-animation';

export default function Hero() {
  const navigate = useNavigate();
  const left  = useReveal();
  const right = useReveal();


const fechaActual = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <section className="hero">
      <div className="hero-grid-bg" />
      <div className="hero-glow hero-glow--l" />
      <div className="hero-glow hero-glow--r" />

      <div ref={left.ref} className={`hero-left reveal ${left.visible ? 'visible' : ''}`}>
        {/*<span className="hero-eyebrow">Bienvenido de vuelta</span>*/}
        <span className="hero-eyebrow">
          Hoy es: {fechaActual}
        </span>
      <h1 className="hero-title">
        <TypeAnimation
          sequence={[
            'Conoce el nuevo',
            2000,
            '',
            500,
            'Portal Corporativo',
            1000,
          ]}
          wrapper="span"
          speed={60}
          repeat={0}
        />
        <br />
        <em>
          <TypeAnimation
            sequence={[
              4500,
              'FABPSA'
            ]}
            wrapper="span"
            speed={60}
            repeat={0}
          />
        </em>
      </h1>
        <p className="hero-sub">
          Tu espacio de trabajo digital. Accede a sistemas,
          comunicados y recursos en un solo lugar.
        </p>
        <div className="hero-btns">
          <button className="btn-gold" onClick={() => navigate('/aplicativos')}>
            <i className="ti ti-apps" /> Aplicativos
          </button>
          <button className="btn-outline" onClick={() => navigate('/cultura-digital')}>
            <i className="ti ti-bulb" /> Cultura Digital
          </button>
        </div>
      </div>

      <div ref={right.ref} className={`hero-right reveal d2 ${right.visible ? 'visible' : ''}`}>
        {/*<div className="quote-card">
          <i className="ti ti-quote quote-i" />
          <p>La primera regla es mantener un espíritu tranquilo. El segundo es mirar las cosas a la cara y conocerlas por lo que son.</p>
          <div className="quote-author">
            <div className="quote-av">AB</div>
            <span className="quote-name">Marco Aurelio</span>
          </div>
        </div>*/}
      </div>
    </section>
  );
}

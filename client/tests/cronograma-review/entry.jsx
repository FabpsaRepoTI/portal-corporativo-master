import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/App.css';
import '../../src/pages/gestionDesarrollo/GestionDesarrolloPage.css';
import '../../src/pages/gestionDesarrollo/ReferenceDesign.css';
import Cronograma from '../../src/pages/gestionDesarrollo/cronograma/CronogramaPage';
createRoot(document.getElementById('root')).render(<div className="layout"><aside className="sidebar">Sidebar</aside><div className="main-wrapper"><nav className="navbar">Navbar</nav><main className="main-content"><div className="gd-root gd-view-cronograma"><div className="gd-header"><div className="gd-header__left"><div className="gd-header__icon">◇</div><div><h1 className="gd-header__title">Gestión de Desarrollo</h1><p className="gd-header__sub">Del portafolio a los resultados</p></div></div><p className="gd-header__tagline">Ideas. Desarrollo. Valor real.</p></div><div className="gd-tabs-wrap"><div className="gd-tabs">{['Portafolio','Mi equipo','Cronograma','Documentación'].map(t=><button className={'gd-tab '+(t==='Cronograma'?'gd-tab--active':'')} key={t}>{t}</button>)}</div></div><div className="gd-body"><Cronograma/></div></div></main></div></div>);

import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/App.css';
import '../../src/pages/gestionDesarrollo/GestionDesarrolloPage.css';
import '../../src/pages/gestionDesarrollo/ReferenceDesign.css';
import Equipo from '../../src/pages/gestionDesarrollo/equipo/EquipoPage';
createRoot(document.getElementById('root')).render(<div className="gd-root gd-view-equipo"><div className="gd-header"><div><h1 className="gd-header__title">Gestión de Desarrollo</h1><p className="gd-header__sub">Del portafolio a los resultados</p></div></div><div className="gd-tabs-wrap"><div className="gd-tabs">{['Portafolio','Mi equipo','Cronograma','Documentación'].map(t=><button className={'gd-tab '+(t==='Mi equipo'?'gd-tab--active':'')} key={t}>{t}</button>)}</div></div><div className="gd-body"><Equipo/></div></div>);
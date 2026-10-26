import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../src/context/AuthContext';
import '../../src/App.css';
import Gestion from '../../src/pages/gestionDesarrollo/GestionDesarrolloPage';
createRoot(document.getElementById('root')).render(<MemoryRouter><AuthContext.Provider value={{
    user: {
      login: 'review',
      name: 'Carlos Mendoza',
      area: 'SISTEMAS'
    },
    token: 'review',
    logout: () => {}
  }}><div className="layout"><aside className="sidebar">Sidebar</aside><div className="main-wrapper"><nav className="navbar">Navbar</nav><main className="main-content"><Gestion /></main></div></div></AuthContext.Provider></MemoryRouter>);

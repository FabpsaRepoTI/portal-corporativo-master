// router/vigilancia.routes.jsx
import { Route } from 'react-router-dom'
import VigilanciaPage from '../pages/vigilancia/VigilanciaPage'
import VigilanciaReporte from '../pages/vigilancia/VigilanciaReporte'
import VigilanciaFirmasPage from '../pages/vigilancia/VigilanciaFirmasPage'

export default (
  <>
    <Route path="/vigilancia" element={<VigilanciaPage />} />
    <Route path="/vigilancia/firmas" element={<VigilanciaFirmasPage />} />
    <Route path="/vigilancia/:idReporte" element={<VigilanciaReporte />} />
  </>
)

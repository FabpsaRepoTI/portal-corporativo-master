// pages/sit/ArticuloDetallePage.jsx
// Detalle de un artículo del ERP: sus documentos en SharePoint (con
// semáforo de vigencia) y la requisitoriedad por proveedor según la matriz
// de información técnica (sit_ap_requisitos).
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import EmpresaBadge from "./components/EmpresaBadge";
import SitHero from "./components/SitHero";
import DocumentosSharePoint from "./components/DocumentosSharePoint";
import Requisitoriedad from "./components/Requisitoriedad";
import useSitToast from "./components/useSitToast";
import { sitApi } from "./sitApi";
import "./sit.css";
import "./SitNube.css";
import "./ArticuloDetallePage.css";

export default function ArticuloDetallePage() {
  const { codigoArticulo } = useParams();
  const [searchParams] = useSearchParams();
  const empresa = searchParams.get("empresa") || "";
  const navigate = useNavigate();
  const [toastEl, showToast] = useSitToast();
  const [articulo, setArticulo] = useState(null);
  const [error, setError] = useState(null);

  // El mismo código puede existir en IAFSA y FDNC: siempre va con la empresa
  const ruta = `/articulos/${encodeURIComponent(codigoArticulo)}${empresa ? `?empresa=${encodeURIComponent(empresa)}` : ""}`;

  useEffect(() => {
    let vivo = true;
    setError(null);
    setArticulo(null);
    sitApi(ruta)
      .then((a) => vivo && setArticulo(a))
      .catch((e) => vivo && setError(e));
    return () => {
      vivo = false;
    };
  }, [ruta]);

  const recargar = () => sitApi(ruta).then(setArticulo).catch(() => {});

  return (
    <main className="sit-root sit-nube">
      <SitHero
        eyebrow="Sistema de Información Técnica"
        titulo="Detalle de"
        resalte="Artículo"
        volver={{ to: "/sit/articulos", label: "Volver a artículos" }}
      />

      {error ? (
        <div className="sit-state sit-state--error">
          <i className={`ti ${error.status === 403 ? "ti-lock" : "ti-alert-circle"}`} />
          <h3>{error.status === 404 ? "Artículo no encontrado" : error.status === 403 ? "Sin acceso" : "No se pudo cargar el artículo"}</h3>
          <p>{error.message}</p>
          <button className="sit-btn" onClick={() => navigate("/sit/articulos")}>
            Volver a artículos
          </button>
        </div>
      ) : !articulo ? (
        <div className="sit-state">
          <i className="ti ti-loader-2 sit-spin" />
          <p>Cargando artículo…</p>
        </div>
      ) : (
        <>
          <section className="sit-card sit-det__articulo">
            <div className="sit-det__articulo-info">
              <small>ARTÍCULO</small>
              <h1>
                {articulo.codigoArticulo}
                <EmpresaBadge empresa={articulo.empresa} />
              </h1>
              <p>{articulo.descripcion}</p>
              <p className="sit-det__comercial">
                {[
                  articulo.tipoMaterial && `Material: ${articulo.tipoMaterial}`,
                  articulo.tipo && articulo.tipo !== "NULL" && `Tipo: ${articulo.tipo}`,
                  articulo.familia && `Familia: ${articulo.familia}`,
                  articulo.proveedorLP && `Proveedor LP: ${articulo.proveedorLP}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </section>

          <DocumentosSharePoint documentos={articulo.documentosSharePoint ?? null} showToast={showToast} onActualizado={recargar} />

          <Requisitoriedad proveedores={articulo.proveedores} />
        </>
      )}

      {toastEl}
    </main>
  );
}

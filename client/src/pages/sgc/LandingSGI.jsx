// pages/sgc/LandingSGI.jsx
// Presentación del SGI (HTML estático en /public/sgc). Se muestra en un iframe
// dentro del layout del SGC para que sus estilos y scripts no choquen con los del portal.
export default function LandingSGI() {
  return (
    <iframe
      src={`${process.env.PUBLIC_URL}/sgc/sgi-landing.html`}
      title="Presentación del SGI"
      style={{ width: "100%", height: "calc(100vh - 64px)", border: 0, display: "block" }}
    />
  );
}

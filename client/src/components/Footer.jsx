export default function Footer() {
  return (
    <footer className="footer">
      <span className="footer-brand">
        © {new Date().getFullYear()} · Un desarrollo de <strong>FABPSA TI</strong>
      </span>
      <div className="footer-links">
        <a href="#">Política de privacidad</a>
        <a href="#">Soporte</a>
        <span>v4.0</span>
      </div>
    </footer>
  );
}

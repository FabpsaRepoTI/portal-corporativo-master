import { useState, useEffect } from "react";
import logo from "../logo-fabpsa.png";

export default function PageLoader({ children }) {
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setLoading(true);
    setVisible(false);

    const showTimer = setTimeout(() => setVisible(true), 30);
    const hideTimer = setTimeout(() => setLoading(false), 420);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [children]);

  return (
    <>
      {loading && (
        <div className={`pl-overlay ${visible ? "pl-overlay--visible" : ""}`}>
          <div className="pl-inner">
            <div className="pl-logo-wrap">
              <img src={logo} alt="FABPSA" className="pl-logo" />
              <div className="pl-ring" />
            </div>
          </div>
        </div>
      )}
      <div className={`pl-content ${!loading ? "pl-content--visible" : ""}`}>
        {children}
      </div>
    </>
  );
}

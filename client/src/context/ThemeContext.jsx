import { createContext, useContext, useState, useEffect } from "react";

const Ctx = createContext();

const getInitialTheme = () => {
  const hasChosen = localStorage.getItem("fabpsa-theme-set");
  const saved = localStorage.getItem("fabpsa-theme");
  if (hasChosen && saved) return saved;
  return "light";
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("fabpsa-theme", theme);
  }, [theme]);

  const toggle = (next) => {
    setTheme(next);
    localStorage.setItem("fabpsa-theme-set", "1");
  };

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

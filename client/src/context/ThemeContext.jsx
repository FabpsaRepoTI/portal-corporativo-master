import { createContext, useContext, useState, useEffect } from 'react';
const Ctx = createContext();
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('fabpsa-theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fabpsa-theme', theme);
  }, [theme]);
  return <Ctx.Provider value={{ theme, toggle: setTheme }}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);

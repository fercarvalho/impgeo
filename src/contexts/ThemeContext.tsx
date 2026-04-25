import React, { createContext, useContext, ReactNode } from 'react';

interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  isDark: false,
});

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ThemeContext.Provider value={{ theme: 'light', toggleTheme: () => {}, isDark: false }}>
    {children}
  </ThemeContext.Provider>
);

export const useTheme = (): ThemeContextType => useContext(ThemeContext);

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="fixed bottom-6 left-6 z-40 group">
      <button
        onClick={toggleTheme}
        className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
        aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      >
        {isDark ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
      </button>

      {/* Tooltip aparece à direita do botão */}
      <div className="absolute left-16 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
        <div className="bg-gray-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg">
          {isDark ? 'Modo claro' : 'Modo escuro'}
          <div className="absolute left-[-6px] top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800" />
        </div>
      </div>
    </div>
  );
};

export default ThemeToggle;

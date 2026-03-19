import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface EcoModeContextType {
  ecoModeEnabled: boolean;
  toggleEcoMode: () => void;
}

const EcoModeContext = createContext<EcoModeContextType | undefined>(undefined);

const STORAGE_KEY = 'ecoModeEnabled';

export const EcoModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [ecoModeEnabled, setEcoModeEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ecoModeEnabled));
    
    // Добавляем класс к body для CSS переменных
    if (ecoModeEnabled) {
      document.body.classList.add('eco-mode');
    } else {
      document.body.classList.remove('eco-mode');
    }
  }, [ecoModeEnabled]);

  const toggleEcoMode = () => {
    setEcoModeEnabled((prev) => !prev);
  };

  return (
    <EcoModeContext.Provider value={{ ecoModeEnabled, toggleEcoMode }}>
      {children}
    </EcoModeContext.Provider>
  );
};

export const useEcoMode = (): EcoModeContextType => {
  const context = useContext(EcoModeContext);
  if (context === undefined) {
    throw new Error('useEcoMode must be used within an EcoModeProvider');
  }
  return context;
};

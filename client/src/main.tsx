import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import {
  diagLog,
  exposeDiagnostics,
  installGlobalErrorReporting,
  startMemoryHeartbeat,
} from './utils/diagnostics';
import './index.css';

// Самодиагностику поднимаем ДО рендера: при падении render-процесса шанса
// доинициализироваться позже не будет, а следы первых секунд иногда и есть ответ.
installGlobalErrorReporting();
exposeDiagnostics();
startMemoryHeartbeat();
diagLog('boot', `react ${React.version}`);

const AppWrapper: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>
);
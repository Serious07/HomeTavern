import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CharactersPage from './pages/CharactersPage';
import ChatPage from './pages/ChatPage';
import HeroPage from './pages/HeroPage';
import SettingsPage from './pages/SettingsPage';
import ProtectedRoute from './components/auth/ProtectedRoute';

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      
      {/* Protected routes */}
      <Route
        path="/characters"
        element={
          <ProtectedRoute>
            <CharactersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/characters/:id"
        element={
          <ProtectedRoute>
            <CharactersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chats"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chats/:id"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hero"
        element={
          <ProtectedRoute>
            <HeroPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      
      {/* Redirect root to characters */}
      <Route path="/" element={<Navigate to="/characters" replace />} />
      
      {/* 404 route */}
      <Route path="*" element={<Navigate to="/characters" replace />} />
    </Routes>
  );
}

export default App;

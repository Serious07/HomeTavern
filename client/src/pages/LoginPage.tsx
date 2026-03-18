import React, { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuthContext } from '../contexts/AuthContext';

interface LoginError {
  message: string;
  field?: string;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login: authLogin } = useAuthContext();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<LoginError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const from = (location.state as any)?.from?.pathname || '/characters';

  const validateFields = (): boolean => {
    if (!username.trim()) {
      setError({ message: 'Имя пользователя обязательно', field: 'username' });
      return false;
    }
    if (!password) {
      setError({ message: 'Пароль обязателен', field: 'password' });
      return false;
    }
    return true;
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('[LoginPage] handleSubmit called');
    
    if (!validateFields()) {
      console.log('[LoginPage] Validation failed');
      return;
    }
    
    console.log('[LoginPage] Validation passed');
    setIsLoading(true);
    setError(null);

    try {
      console.log('[LoginPage] Starting login request...');
      const response = await axios.post('/api/auth/login', {
        username: username.trim(),
        password,
      });

      console.log('[LoginPage] Response received:', response.status);
      console.log('[LoginPage] Response data:', response.data);
      
      const { token, user } = response.data;
      
      console.log('[LoginPage] Token received from server:', token ? 'OK' : 'EMPTY');
      console.log('[LoginPage] Token value:', token);
      console.log('[LoginPage] User data:', user);
      
      if (!token) {
        console.error('[LoginPage] ERROR: Token is empty or missing!');
        setError({ message: 'Ошибка: токен не получен от сервера' });
        setIsLoading(false);
        return;
      }
      
      // Use AuthContext to save token and update state
      console.log('[LoginPage] Calling authLogin()...');
      console.log('[LoginPage] Before authLogin - localStorage auth_token:', localStorage.getItem('auth_token'));
      
      authLogin(token, user);
      
      console.log('[LoginPage] After authLogin - localStorage auth_token:', localStorage.getItem('auth_token'));
      console.log('[LoginPage] Auth context updated with token and user');
      
      // Redirect to the intended page or default to characters
      console.log('[LoginPage] Navigating to:', from);
      navigate(from, { replace: true });
      console.log('[LoginPage] Navigate called');
    } catch (err: any) {
      console.error('[LoginPage] Login error:', err);
      console.error('[LoginPage] Error response:', err.response?.data);
      const errorMessage = err.response?.data?.message || 'Ошибка при входе';
      setError({ message: errorMessage });
    } finally {
      console.log('[LoginPage] Setting isLoading to false');
      setIsLoading(false);
    }
  }, [username, password, navigate, from]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-gray-700">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Добро пожаловать
            </h1>
            <p className="text-gray-400">
              Войдите в свой аккаунт для продолжения
            </p>
          </div>

          {/* Error message */}
          {error && !error.field && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-red-400 text-sm">{error.message}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username field */}
            <div>
              <label 
                htmlFor="username" 
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Имя пользователя
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error?.field === 'username') {
                    setError(null);
                  }
                }}
                className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                  error?.field === 'username' 
                    ? 'border-red-500' 
                    : 'border-gray-600 focus:border-blue-500'
                } text-white placeholder-gray-500`}
                placeholder="Введите имя пользователя"
                autoComplete="username"
                disabled={isLoading}
              />
              {error?.field === 'username' && (
                <p className="mt-1 text-sm text-red-400">{error.message}</p>
              )}
            </div>

            {/* Password field */}
            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Пароль
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error?.field === 'password') {
                    setError(null);
                  }
                }}
                className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                  error?.field === 'password' 
                    ? 'border-red-500' 
                    : 'border-gray-600 focus:border-blue-500'
                } text-white placeholder-gray-500`}
                placeholder="Введите пароль"
                autoComplete="current-password"
                disabled={isLoading}
              />
              {error?.field === 'password' && (
                <p className="mt-1 text-sm text-red-400">{error.message}</p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Вход...
                </span>
              ) : (
                'Войти'
              )}
            </button>
          </form>

          {/* Register link */}
          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Нет аккаунта?{' '}
              <button
                onClick={() => navigate('/register')}
                className="text-blue-400 hover:text-blue-300 font-medium transition"
              >
                Зарегистрироваться
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

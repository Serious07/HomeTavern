import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface RegisterError {
  message: string;
  field?: string;
}

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<RegisterError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const validateFields = (): boolean => {
    // Username validation
    if (!username.trim()) {
      setError({ message: 'Имя пользователя обязательно', field: 'username' });
      return false;
    }
    if (username.length < 3) {
      setError({ message: 'Имя пользователя должно быть не менее 3 символов', field: 'username' });
      return false;
    }

    // Password validation
    if (!password) {
      setError({ message: 'Пароль обязателен', field: 'password' });
      return false;
    }
    if (password.length < 6) {
      setError({ message: 'Пароль должен быть не менее 6 символов', field: 'password' });
      return false;
    }

    // Confirm password validation
    if (!confirmPassword) {
      setError({ message: 'Подтвердите пароль', field: 'confirmPassword' });
      return false;
    }
    if (password !== confirmPassword) {
      setError({ message: 'Пароли не совпадают', field: 'confirmPassword' });
      return false;
    }

    return true;
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateFields()) return;
    
    setIsLoading(true);
    setError(null);

    try {
      await axios.post('/api/auth/register', {
        username: username.trim(),
        password,
      });

      // Registration successful, redirect to login
      navigate('/login', {
        state: { message: 'Регистрация успешна! Теперь войдите в свой аккаунт.' }
      });
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Ошибка при регистрации';
      setError({ message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, [username, password, confirmPassword, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-gray-700">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Регистрация
            </h1>
            <p className="text-gray-400">
              Создайте новый аккаунт для продолжения
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
                className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition ${
                    error?.field === 'username' 
                      ? 'border-red-500' 
                      : 'border-gray-600 focus:border-gray-500'
                } text-white placeholder-gray-500`}
                placeholder="Придумайте имя пользователя"
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
                className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition ${
                    error?.field === 'password' 
                      ? 'border-red-500' 
                      : 'border-gray-600 focus:border-gray-500'
                } text-white placeholder-gray-500`}
                placeholder="Придумайте пароль"
                autoComplete="new-password"
                disabled={isLoading}
              />
              {error?.field === 'password' && (
                <p className="mt-1 text-sm text-red-400">{error.message}</p>
              )}
            </div>

            {/* Confirm password field */}
            <div>
              <label 
                htmlFor="confirmPassword" 
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Подтвердите пароль
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error?.field === 'confirmPassword') {
                    setError(null);
                  }
                }}
                className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition ${
                    error?.field === 'confirmPassword' 
                      ? 'border-red-500' 
                      : 'border-gray-600 focus:border-gray-500'
                } text-white placeholder-gray-500`}
                placeholder="Повторите пароль"
                autoComplete="new-password"
                disabled={isLoading}
              />
              {error?.field === 'confirmPassword' && (
                <p className="mt-1 text-sm text-red-400">{error.message}</p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Регистрация...
                </span>
              ) : (
                'Зарегистрироваться'
              )}
            </button>
          </form>

          {/* Login link */}
          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Уже есть аккаунт?{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-cyan-400 hover:text-cyan-300 font-medium transition"
              >
                Войти
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;

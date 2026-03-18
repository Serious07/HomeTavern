import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { authState, logout } = useAuth();
  
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="bg-gray-800/50 border-b border-gray-700 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Настройки
            </h1>
            <nav className="flex items-center gap-2 md:gap-4">
              <button
                onClick={() => navigate('/hero')}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
                title="Профиль героя"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a5 5 0 00-5 5h10a5 5 0 00-5-5z" />
                </svg>
              </button>
              <button
                onClick={() => navigate('/characters')}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
                title="Персонажи"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* User info card */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Профиль пользователя</h2>
            
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-600 to-gray-500 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">
                  {authState.user?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div>
                <p className="text-white font-semibold text-lg">
                  {authState.user?.username || 'Пользователь'}
                </p>
                <p className="text-gray-400 text-sm">
                  ID: {authState.user?.id || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Appearance settings */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Внешний вид</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Тёмная тема</p>
                  <p className="text-gray-400 text-sm">Использовать тёмную тему интерфейса</p>
                </div>
                <div className="w-12 h-6 bg-gray-600 rounded-full relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Компактный режим</p>
                  <p className="text-gray-400 text-sm">Уменьшить отступы и размеры элементов</p>
                </div>
                <button className="w-12 h-6 bg-gray-600 rounded-full relative">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </button>
              </div>
            </div>
          </div>

          {/* Chat settings */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Настройки чата</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Показывать мышление ИИ</p>
                  <p className="text-gray-400 text-sm">Отображать промежуточные рассуждения модели</p>
                </div>
                <button className="w-12 h-6 bg-blue-600 rounded-full relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Потоковая передача</p>
                  <p className="text-gray-400 text-sm">Показывать ответ по мере генерации</p>
                </div>
                <button className="w-12 h-6 bg-blue-600 rounded-full relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </button>
              </div>
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-gray-800/50 rounded-2xl border border-red-700/50 p-6">
            <h2 className="text-xl font-bold text-red-400 mb-4">Опасная зона</h2>
            
            <p className="text-gray-400 mb-4">
              Эти действия необратимы. Будьте осторожны.
            </p>
            
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold text-white transition"
            >
              Выйти из аккаунта
            </button>
          </div>
        </div>
      </div>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Подтверждение</h3>
            <p className="text-gray-400 mb-6">
              Вы уверены, что хотите выйти из аккаунта?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold text-white transition"
              >
                Отмена
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold text-white transition"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;

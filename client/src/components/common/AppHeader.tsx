import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Единый компонент шапки приложения с навигацией
 * Навигационные кнопки расположены справа и одинаковы на всех страницах
 */
const AppHeader: React.FC<{
  title: string;
  extraActions?: React.ReactNode;
}> = ({ title, extraActions }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Определение активных страниц
  const isHeroActive = location.pathname === '/hero';
  const isCharactersActive = location.pathname === '/characters';
  const isChatsActive = location.pathname.startsWith('/chats');
  const isSettingsActive = location.pathname === '/settings';

  return (
    <div className="bg-gray-800/50 border-b border-gray-700 sticky top-0 z-10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            {title}
          </h1>
          <nav className="flex items-center gap-2 md:gap-4">
            {/* Кнопка Профиль героя */}
            <button
              onClick={() => navigate('/hero')}
              className={`p-2 rounded-lg transition ${
                isHeroActive
                  ? 'text-white bg-gray-700'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title="Профиль героя"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a5 5 0 00-5 5h10a5 5 0 00-5-5z" />
              </svg>
            </button>

            {/* Кнопка Персонажи */}
            <button
              onClick={() => navigate('/characters')}
              className={`p-2 rounded-lg transition ${
                isCharactersActive
                  ? 'text-white bg-gray-700'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title="Персонажи"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </button>

            {/* Кнопка Чаты */}
            <button
              onClick={() => navigate('/chats')}
              className={`p-2 rounded-lg transition ${
                isChatsActive
                  ? 'text-white bg-gray-700'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title="Чаты"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h13M8 12l-4-4m4 4l4-4m-4 4v10m-4-10H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-4" />
              </svg>
            </button>

            {/* Кнопка Настройки */}
            <button
              onClick={() => navigate('/settings')}
              className={`p-2 rounded-lg transition ${
                isSettingsActive
                  ? 'text-white bg-gray-700'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title="Настройки"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Дополнительные действия (если переданы) */}
            {extraActions && (
              <div className="flex items-center gap-2 ml-2 border-l border-gray-700 pl-2">
                {extraActions}
              </div>
            )}
          </nav>
        </div>
      </div>
    </div>
  );
};

export default AppHeader;

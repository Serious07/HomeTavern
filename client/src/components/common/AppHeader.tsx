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
  const isSystemPromptsActive = location.pathname === '/system-prompts';

  return (
    <>
      {/* Мобильная навигационная панель сверху (только на мобильных) */}
      <div className="md:hidden sticky top-0 bg-gray-800/90 border-b border-gray-700 backdrop-blur-sm z-50">
        <div className="flex items-center justify-around py-2 px-1">
          {/* Кнопка Чаты */}
          <button
            onClick={() => navigate('/chats')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition min-w-[60px] ${
              isChatsActive
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Чаты"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 2H4C2.9 2 2 2.9 2 4V16C2 17.1 2.9 18 4 18H17L22 22V4C22 2.9 21.1 2 20 2Z" />
              <rect x="6" y="7" width="12" height="2" rx="1" fill="currentColor" />
              <rect x="6" y="11" width="6" height="2" rx="1" fill="currentColor" />
            </svg>
            <span className="text-xs mt-1">Чаты</span>
          </button>

          {/* Кнопка Персонажи */}
          <button
            onClick={() => navigate('/characters')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition min-w-[60px] ${
              isCharactersActive
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Персонажи"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-xs mt-1">Персонажи</span>
          </button>

          {/* Кнопка Профиль героя */}
          <button
            onClick={() => navigate('/hero')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition min-w-[60px] ${
              isHeroActive
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Профиль героя"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a5 5 0 00-5 5h10a5 5 0 00-5-5z" />
            </svg>
            <span className="text-xs mt-1">Герой</span>
          </button>

          {/* Кнопка Системные промпты */}
          <button
            onClick={() => navigate('/system-prompts')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition min-w-[60px] ${
              isSystemPromptsActive
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Системные промпты"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs mt-1">Промпты</span>
          </button>

          {/* Кнопка Настройки */}
          <button
            onClick={() => navigate('/settings')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition min-w-[60px] ${
              isSettingsActive
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Настройки"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs mt-1">Настройки</span>
          </button>
        </div>
      </div>

      {/* Десктопная навигация (только на десктопе) */}
      <div className="hidden md:block bg-gray-800/50 border-b border-gray-700 sticky top-0 z-10">
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 2H4C2.9 2 2 2.9 2 4V16C2 17.1 2.9 18 4 18H17L22 22V4C22 2.9 21.1 2 20 2Z" />
                  <rect x="6" y="7" width="12" height="2" rx="1" fill="currentColor" />
                  <rect x="6" y="11" width="6" height="2" rx="1" fill="currentColor" />
                </svg>
              </button>

              {/* Кнопка Системные промпты */}
              <button
                onClick={() => navigate('/system-prompts')}
                className={`p-2 rounded-lg transition ${
                  isSystemPromptsActive
                    ? 'text-white bg-gray-700'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
                title="Системные промпты"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
    </>
  );
};

export default AppHeader;

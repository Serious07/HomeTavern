import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { api } from '../services/api';
import AppHeader from '../components/common/AppHeader';
import { getVisibleMessageLimit, setVisibleMessageLimit } from '../components/chat/MessageList';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthContext();
  
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  const [visibleMessageLimit, setVisibleMessageLimitState] = useState(getVisibleMessageLimit());
  const [limitInput, setLimitInput] = useState(String(getVisibleMessageLimit()));
  
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [soundLoading, setSoundLoading] = useState<boolean>(false);
  
  const [notificationVolume, setNotificationVolume] = useState<number>(70);
  const [translationEnabled, setTranslationEnabled] = useState<boolean>(true);
  const [translationLoading, setTranslationLoading] = useState<boolean>(false);
  
  useEffect(() => {
    setLimitInput(String(visibleMessageLimit));
  }, [visibleMessageLimit]);
  
  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data } = await api.get('/settings');
        if (data?.sound_enabled !== undefined) {
          setSoundEnabled(data.sound_enabled === 'true');
        }
        if (data?.notification_volume !== undefined) {
          setNotificationVolume(Number(data.notification_volume));
        }
        if (data?.translation_enabled !== undefined) {
          setTranslationEnabled(data.translation_enabled === 'true');
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleTranslationToggle = async () => {
    const newValue = !translationEnabled;
    setTranslationEnabled(newValue);
    setTranslationLoading(true);
    try {
      await api.put('/settings', { key: 'translation_enabled', value: String(newValue) });
    } catch (error) {
      console.error('Failed to save translation setting:', error);
      setTranslationEnabled(!newValue); // Revert on error
    } finally {
      setTranslationLoading(false);
    }
  };
  
  const handleSaveLimit = useCallback(() => {
    const parsed = parseInt(limitInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setVisibleMessageLimit(parsed);
      setVisibleMessageLimitState(parsed);
    } else {
      setLimitInput(String(visibleMessageLimit));
    }
  }, [limitInput, visibleMessageLimit]);
  
  const handleSoundToggle = async () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    setSoundLoading(true);
    try {
      await api.put('/settings', { key: 'sound_enabled', value: String(newValue) });
    } catch (error) {
      console.error('Failed to save sound setting:', error);
      setSoundEnabled(!newValue); // Revert on error
    } finally {
      setSoundLoading(false);
    }
  };
  
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value);
    setNotificationVolume(newVolume);
    api.put('/settings', { key: 'notification_volume', value: String(newVolume) }).catch(err => {
      console.error('Failed to save volume setting:', err);
    });
  };
  
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleChangePassword = useCallback(async () => {
    // Validation
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Заполните все поля' });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Новые пароли не совпадают' });
      return;
    }
    
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Новый пароль должен быть не менее 6 символов' });
      return;
    }

    setIsChangingPassword(true);
    setPasswordMessage(null);

    try {
      await api.post('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      
      setPasswordMessage({ type: 'success', text: 'Пароль успешно изменен' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMessage({
        type: 'error',
        text: err.response?.data?.message || 'Ошибка при смене пароля'
      });
    } finally {
      setIsChangingPassword(false);
    }
  }, [oldPassword, newPassword, confirmPassword]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <AppHeader title="Настройки" />

      {/* Main content */}
      <div className="container mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* User info card */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
            <h2 className="text-xl font-bold text-white mb-6">Профиль пользователя</h2>
            
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-3xl font-bold">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1">
                <div className="mb-3">
                  <p className="text-gray-400 text-sm mb-1">Логин</p>
                  <p className="text-white font-semibold text-xl">
                    {user?.username || 'Пользователь'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">ID пользователя</p>
                  <p className="text-white font-mono text-lg">
                    {user?.id ?? '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Display settings */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
            <h2 className="text-xl font-bold text-white mb-6">Отображение</h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="visibleLimit" className="block text-sm font-medium text-gray-300 mb-2">
                  Лимит отображаемых сообщений
                </label>
                <p className="text-xs text-gray-400 mb-3">
                  Оптимизация производительности: на экране отображается только указанное количество сообщений одновременно.
                  Вся история сохраняется и доступна при прокрутке.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    id="visibleLimit"
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    min="10"
                    max="500"
                    className="w-32 px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                    placeholder="50"
                  />
                  <button
                    onClick={handleSaveLimit}
                    className="py-3 px-6 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-white transition"
                  >
                    Применить
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Текущий лимит: {visibleMessageLimit} сообщений
                </p>
              </div>
            </div>
          </div>

          {/* Notifications section */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
            <h2 className="text-xl font-bold text-white mb-6">Уведомления</h2>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300 font-medium">Звук уведомлений</p>
                <p className="text-sm text-gray-400 mt-1">
                  Воспроизводить звук, когда ИИ закончит генерацию сообщения
                </p>
              </div>
              <button
                type="button"
                onClick={handleSoundToggle}
                disabled={soundLoading}
                className={`${
                  soundEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                role="switch"
                aria-checked={soundEnabled}
              >
                <span
                  className={`${
                    soundEnabled ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </button>
            </div>
            
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label htmlFor="notification-volume" className="text-sm text-gray-300">
                  Громкость уведомления
                </label>
                <span className="text-sm text-gray-400">{notificationVolume}%</span>
              </div>
              <input
                type="range"
                id="notification-volume"
                min="0"
                max="100"
                value={notificationVolume}
                onChange={handleVolumeChange}
                className="w-full mt-2 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Тихо</span>
                <span>Громко</span>
              </div>
            </div>
          </div>

          {/* Display settings */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
            <h2 className="text-xl font-bold text-white mb-6">Отображение</h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="visibleLimit" className="block text-sm font-medium text-gray-300 mb-2">
                  Лимит отображаемых сообщений
                </label>
                <p className="text-xs text-gray-400 mb-3">
                  Оптимизация производительности: на экране отображается только указанное количество сообщений одновременно.
                  Вся история сохраняется и доступна при прокрутке.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    id="visibleLimit"
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    min="10"
                    max="500"
                    className="w-32 px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                    placeholder="50"
                  />
                  <button
                    onClick={handleSaveLimit}
                    className="py-3 px-6 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-white transition"
                  >
                    Применить
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Текущий лимит: {visibleMessageLimit} сообщений
                </p>
              </div>
            </div>
          </div>

            {/* Translation section */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white mb-6">Перевод</h2>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-300 font-medium">Перевод сообщений на английский</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Автоматически переводить сообщения с русского на английский для отправки ИИ. При отключении ИИ будет получать сообщения на исходном языке.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTranslationToggle}
                  disabled={translationLoading}
                  className={`${
                    translationEnabled ? 'bg-blue-600' : 'bg-gray-400'
                  } relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900`}
                  role="switch"
                  aria-checked={translationEnabled}
                >
                  <span
                    className={`${
                      translationEnabled ? 'translate-x-5' : 'translate-x-0'
                    } inline-block h-6 w-6 transform rounded-full bg-white shadow transition duration-200 ease-in-out`}
                  />
                </button>
              </div>
            </div>

           {/* Security section */}
          <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
            <h2 className="text-xl font-bold text-white mb-6">Безопасность</h2>
            
            {passwordMessage && (
              <div className={`mb-6 p-4 rounded-lg ${
                passwordMessage.type === 'success'
                  ? 'bg-green-900/30 border border-green-700'
                  : 'bg-red-900/30 border border-red-700'
              }`}>
                <p className={passwordMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}>
                  {passwordMessage.text}
                </p>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label htmlFor="oldPassword" className="block text-sm font-medium text-gray-300 mb-2">
                  Старый пароль
                </label>
                <input
                  type="password"
                  id="oldPassword"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                  placeholder="Введите старый пароль"
                  disabled={isChangingPassword}
                />
              </div>
              
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-2">
                  Новый пароль
                </label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                  placeholder="Введите новый пароль (минимум 6 символов)"
                  disabled={isChangingPassword}
                />
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                  Повторите новый пароль
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                  placeholder="Повторите новый пароль"
                  disabled={isChangingPassword}
                />
              </div>
              
              <button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
              >
                {isChangingPassword ? 'Смена пароля...' : 'Сменить пароль'}
              </button>
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-gray-800/50 rounded-2xl border border-red-700/50 p-6">
            <h2 className="text-xl font-bold text-red-400 mb-4">Опасная зона</h2>
            
            <p className="text-gray-400 mb-6">
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

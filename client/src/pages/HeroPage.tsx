import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Hero } from '../types';

const HeroPage: React.FC = () => {
  const navigate = useNavigate();
  
  const [hero, setHero] = useState<Partial<Hero>>({
    name: '',
    description: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchHero = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await axios.get('/api/hero');
      if (response.data) {
        setHero(response.data);
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setError(err.response?.data?.message || 'Ошибка при загрузке профиля');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHero();
  }, [fetchHero]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setHero((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSave = async () => {
    if (!hero.name?.trim()) {
      setError('Имя героя обязательно');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await axios.put('/api/hero', hero);
      setSuccess('Профиль успешно сохранен!');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при сохранении профиля');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setHero({
      name: '',
      description: '',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="bg-gray-800/50 border-b border-gray-700 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Профиль героя
            </h1>
            <nav className="flex items-center gap-2 md:gap-4">
              <button
                onClick={() => navigate('/characters')}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
                title="Персонажи"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </button>
              <button
                onClick={() => navigate('/chats')}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
                title="Чаты"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h13M8 12l-4-4m4 4l4-4m-4 4v10m-4-10H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-4" />
                </svg>
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Info card */}
          <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-blue-300 text-sm">
                Этот профиль будет использоваться как контекст для всех ваших чатов с персонажами. 
                Персонажи будут знать ваше имя и описание при генерации ответов.
              </p>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="mb-6 p-4 bg-green-900/30 border border-green-700 rounded-lg">
              <p className="text-green-400">{success}</p>
            </div>
          )}

          {/* Loading state */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : (
            /* Form */
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
              {/* Name field */}
              <div className="mb-6">
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  Имя героя *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={hero.name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                  placeholder="Введите ваше имя"
                  disabled={isSaving}
                />
              </div>

              {/* Description field */}
              <div className="mb-6">
                <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
                  Описание
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={hero.description}
                  onChange={handleInputChange}
                  rows={6}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-white placeholder-gray-500"
                  placeholder="Опишите себя: возраст, внешность, характер, особенности, историю..."
                  disabled={isSaving}
                />
                <p className="mt-2 text-sm text-gray-500">
                  Это описание будет доступно персонажам для лучшего понимания вас
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-4">
                <button
                  onClick={handleClear}
                  disabled={isSaving}
                  className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
                >
                  Очистить
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
                >
                  {isSaving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HeroPage;

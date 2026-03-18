import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { HeroVariation } from '../types';

const HeroPage: React.FC = () => {
  const navigate = useNavigate();
  
  const [heroVariations, setHeroVariations] = useState<HeroVariation[]>([]);
  const [currentVariation, setCurrentVariation] = useState<HeroVariation | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const fetchHeroVariations = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/hero');
      const variations: HeroVariation[] = response.data || [];
      setHeroVariations(variations);
      
      // Найти активную вариацию
      const active = variations.find(v => v.is_active === 1);
      if (active) {
        setCurrentVariation(active);
        setName(active.name);
        setDescription(active.description || '');
      } else {
        setCurrentVariation(null);
        setName('');
        setDescription('');
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setError(err.response?.data?.message || 'Ошибка при загрузке профилей героя');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHeroVariations();
  }, [fetchHeroVariations]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name: fieldName, value } = e.target;
    if (fieldName === 'name') {
      setName(value);
    } else if (fieldName === 'description') {
      setDescription(value);
    }
    setError(null);
  };

  const handleSaveCurrent = async () => {
    if (!name.trim()) {
      setError('Имя героя обязательно');
      return;
    }

    if (!currentVariation) {
      setError('Сначала создайте новую вариацию героя');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.put(`/hero/${currentVariation.id}`, {
        name,
        description,
      });
      setSuccess('Профиль успешно сохранен!');
      await fetchHeroVariations();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при сохранении профиля');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNew = async () => {
    if (!name.trim()) {
      setError('Имя героя обязательно');
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post('/hero', {
        name,
        description,
        is_active: true,
      });
      
      setSuccess('Новый профиль героя создан!');
      setShowCreateForm(false);
      await fetchHeroVariations();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при создании профиля');
    } finally {
      setIsCreating(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      await api.put(`/hero/${id}/activate`);
      setSuccess('Профиль активирован!');
      await fetchHeroVariations();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при активации профиля');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот профиль героя?')) {
      return;
    }

    try {
      await api.delete(`/hero/${id}`);
      setSuccess('Профиль удален');
      await fetchHeroVariations();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при удалении профиля');
    }
  };

  const handleClear = () => {
    if (currentVariation) {
      setName(currentVariation.name);
      setDescription(currentVariation.description || '');
    } else {
      setName('');
      setDescription('');
    }
  };

  const handleStartNew = () => {
    setShowCreateForm(true);
    setName('');
    setDescription('');
    setError(null);
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    if (currentVariation) {
      setName(currentVariation.name);
      setDescription(currentVariation.description || '');
    } else {
      setName('');
      setDescription('');
    }
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
        <div className="max-w-4xl mx-auto">
          {/* Info card */}
          <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-300 text-sm">
                Создавайте вариации вашего героя и выбирайте активный профиль. 
                Активный профиль будет использоваться во всех чатах для контекста LLM.
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

          {/* List of hero variations */}
          {!showCreateForm && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Ваши профили</h2>
                <button
                  onClick={handleStartNew}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-white transition"
                >
                  + Новый профиль
                </button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <svg className="animate-spin h-10 w-10 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : heroVariations.length === 0 ? (
                <div className="bg-gray-800/50 rounded-lg p-8 text-center">
                  <p className="text-gray-400">У вас пока нет профилей героя</p>
                  <button
                    onClick={handleStartNew}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-white transition"
                  >
                    Создать первый профиль
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {heroVariations.map((variation) => (
                    <div
                      key={variation.id}
                      className={`bg-gray-800/50 rounded-lg p-4 border ${
                        variation.is_active === 1 ? 'border-blue-500' : 'border-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-white">{variation.name}</h3>
                            {variation.is_active === 1 && (
                              <span className="px-2 py-0.5 bg-blue-600 text-xs rounded-full">Активный</span>
                            )}
                          </div>
                          {variation.description && (
                            <p className="mt-2 text-sm text-gray-400 line-clamp-2">{variation.description}</p>
                          )}
                          <p className="mt-2 text-xs text-gray-500">
                            Создан: {new Date(variation.created_at).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {variation.is_active !== 1 && (
                            <button
                              onClick={() => handleActivate(variation.id)}
                              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition"
                            >
                              Активировать
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setCurrentVariation(variation);
                              setName(variation.name);
                              setDescription(variation.description || '');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition"
                          >
                            Редактировать
                          </button>
                          {heroVariations.length > 1 && (
                            <button
                              onClick={() => handleDelete(variation.id)}
                              className="px-3 py-1 text-sm bg-red-900/50 hover:bg-red-800/50 rounded-lg text-red-400 transition"
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Create/Edit form */}
          {(showCreateForm || currentVariation) && (
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
              {/* Form header */}
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-white">
                  {showCreateForm ? 'Создание нового профиля' : 'Редактирование профиля'}
                </h2>
                {currentVariation && !showCreateForm && (
                  <p className="text-sm text-gray-400 mt-1">
                    Редактирование профиля: {currentVariation.name}
                  </p>
                )}
              </div>

              {/* Name field */}
              <div className="mb-6">
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  Имя героя *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-white placeholder-gray-500"
                  placeholder="Введите ваше имя"
                  disabled={isSaving || isCreating}
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
                  value={description}
                  onChange={handleInputChange}
                  rows={6}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none text-white placeholder-gray-500"
                  placeholder="Опишите себя: возраст, внешность, характер, особенности, историю..."
                  disabled={isSaving || isCreating}
                />
                <p className="mt-2 text-sm text-gray-500">
                  Это описание будет доступно персонажам для лучшего понимания вас
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-4">
                <button
                  onClick={handleCancelCreate}
                  disabled={isSaving || isCreating}
                  className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
                >
                  Отмена
                </button>
                <button
                  onClick={handleClear}
                  disabled={isSaving || isCreating}
                  className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
                >
                  Очистить
                </button>
                <button
                  onClick={showCreateForm ? handleCreateNew : handleSaveCurrent}
                  disabled={isSaving || isCreating}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
                >
                  {isCreating
                    ? 'Создание...'
                    : isSaving
                    ? 'Сохранение...'
                    : showCreateForm
                    ? 'Создать'
                    : 'Сохранить'}
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

import React, { useState, useEffect, useRef } from 'react';
import { Character, CharacterGreeting } from '../../types';
import { charactersApi } from '../../services/api';

interface CharacterEditorProps {
  character?: Character;
  onSave: (character: Omit<Character, 'id' | 'created_at' | 'updated_at'>) => void;
  onCancel: () => void;
}

type TabId = 'identity' | 'appearance' | 'description' | 'personality' | 'greetings';

const CharacterEditor: React.FC<CharacterEditorProps> = ({
  character,
  onSave,
  onCancel,
}) => {
  const isEditing = !!character?.id;
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    short_description: '',
    personality: '',
    first_message: '',
    avatar: '',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('identity');

  // Greetings state
  const [_greetings, setGreetings] = useState<CharacterGreeting[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [greetingsLoading, setGreetingsLoading] = useState(false);
  const [greetingsError, setGreetingsError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (character) {
      setFormData({
        name: character.name || '',
        description: character.description || '',
        short_description: character.short_description || '',
        personality: character.personality || '',
        first_message: character.first_message || '',
        avatar: character.avatar || '',
      });
      if (character.avatar) {
        setAvatarPreview(character.avatar);
      }
    }
  }, [character]);

  // Load greetings when switching to greetings tab
  useEffect(() => {
    if (activeTab === 'greetings' && character?.id && messages.length === 0) {
      loadGreetings();
    }
  }, [activeTab, character?.id]);

  const loadGreetings = async () => {
    if (!character?.id) return;
    
    setGreetingsLoading(true);
    setGreetingsError(null);
    try {
      const response = await charactersApi.getGreetings(character.id);
      const greetingsData = response.data as CharacterGreeting[];
      setGreetings(greetingsData);
      setMessages(greetingsData.map(g => g.message));
      if (greetingsData.length === 0) {
        setMessages(['']);
      }
    } catch (err: any) {
      // If no greetings exist, start with empty message
      if (err?.response?.status === 404) {
        setMessages(['']);
      } else {
        setGreetingsError('Не удалось загрузить приветствия');
        setMessages(['']);
      }
    } finally {
      setGreetingsLoading(false);
    }
  };

  const validateFields = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Имя персонажа обязательно';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Описание обязательно';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setFormData((prev) => ({ ...prev, avatar: result }));
        setAvatarPreview(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateShortDescription = async () => {
    if (!formData.description.trim()) {
      setErrors((prev) => ({ ...prev, short_description: 'Сначала заполните основное описание' }));
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/characters/generate-short-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ description: formData.description }),
      });

      if (!response.ok) throw new Error('Ошибка при генерации');

      const data = await response.json();
      setFormData((prev) => ({ ...prev, short_description: data.short_description }));
    } catch (error) {
      setErrors((prev) => ({ ...prev, short_description: 'Не удалось сгенерировать описание' }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranslateShortDescription = async () => {
    if (!formData.short_description.trim()) {
      setErrors((prev) => ({ ...prev, short_description: 'Нет текста для перевода' }));
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ text: formData.short_description, targetLang: 'ru' }),
      });

      if (!response.ok) throw new Error('Ошибка при переводе');

      const data = await response.json();
      setFormData((prev) => ({ ...prev, short_description: data.translatedText }));
    } catch (error) {
      setErrors((prev) => ({ ...prev, short_description: 'Не удалось перевести текст' }));
    } finally {
      setIsLoading(false);
    }
  };

  // === Greetings management functions ===
  const updateMessage = (index: number, value: string) => {
    const updated = [...messages];
    updated[index] = value;
    setMessages(updated);
  };

  const addMessage = () => {
    if (messages.length >= 50) return;
    setMessages([...messages, '']);
  };

  const removeMessage = (index: number) => {
    if (messages.length <= 1) return;
    const updated = messages.filter((_, i) => i !== index);
    setMessages(updated);
  };

  const moveMessage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === messages.length - 1) return;
    
    const updated = [...messages];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setMessages(updated);
  };

  const handleGreetingsSave = async () => {
    // Filter empty messages
    const nonEmptyMessages = messages.map(m => m.trim()).filter(m => m.length > 0);
    
    if (nonEmptyMessages.length === 0) {
      setGreetingsError('Добавьте хотя бы одно приветствие');
      return;
    }

    setGreetingsLoading(true);
    setGreetingsError(null);
    try {
      if (character?.id) {
        const result = await charactersApi.setGreetings(character.id, nonEmptyMessages);
        setGreetings(result.data as CharacterGreeting[]);
        // Update local messages to reflect saved state
        const savedMessages = (result.data as CharacterGreeting[]).map(g => g.message);
        if (savedMessages.length > 0) {
          setMessages(savedMessages);
        }
      }
    } catch (error: any) {
      setGreetingsError('Ошибка при сохранении: ' + (error.response?.data?.error || error.message));
    } finally {
      setGreetingsLoading(false);
    }
  };

  const getPreview = (message: string, maxLength: number = 120): string => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateFields()) return;
    
    onSave(formData);
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'identity',
      label: 'Имя',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
    },
    {
      id: 'appearance',
      label: 'Внешность',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'description',
      label: 'Описание',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      ),
    },
    {
      id: 'personality',
      label: 'Личность',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'greetings',
      label: 'Приветствия',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
  ];

  // Tab content component
  const renderTabContent = () => {
    switch (activeTab) {
      case 'identity':
        return (
          <div className="space-y-5">
            {/* Name field */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                <svg className="w-4 h-4 inline mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Имя персонажа <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                  errors.name ? 'border-red-500' : 'border-gray-600'
                } text-white placeholder-gray-500`}
                placeholder="Например: Гермиона Грейнджер"
                disabled={isLoading}
              />
              {errors.name && <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {errors.name}
              </p>}
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-5">
            {/* Avatar section */}
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-full bg-gray-700 overflow-hidden flex-shrink-0 border-2 border-gray-600 group/avatar cursor-pointer hover:border-gray-500 transition relative">
                {avatarPreview ? (
                  <>
                    <img 
                      src={avatarPreview} 
                      alt="Avatar preview" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer">
                      <label className="cursor-pointer text-white hover:text-gray-300">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          className="hidden"
                          disabled={isLoading}
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <label className="flex items-center justify-center cursor-pointer w-full h-full text-gray-500 hover:text-gray-400">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                      disabled={isLoading}
                    />
                  </label>
                )}
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Аватар (опционально)
                </label>
                {!avatarPreview && (
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                      disabled={isLoading}
                    />
                    <span className="inline-block px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition cursor-pointer">
                      Загрузить изображение
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Short description */}
            <div>
              <label htmlFor="short_description" className="block text-sm font-medium text-gray-300 mb-2">
                <svg className="w-4 h-4 inline mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Краткое описание
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={handleGenerateShortDescription}
                  disabled={isLoading || !formData.description.trim()}
                  className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition flex items-center gap-2"
                  title="Сгенерировать краткое описание через ИИ"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Сгенерировать
                </button>
                <button
                  type="button"
                  onClick={handleTranslateShortDescription}
                  disabled={isLoading || !formData.short_description.trim()}
                  className="px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition flex items-center gap-2"
                  title="Перевести на русский"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  Перевести на RU
                </button>
              </div>
              <textarea
                id="short_description"
                name="short_description"
                value={formData.short_description}
                onChange={handleInputChange}
                rows={4}
                className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-y text-sm ${
                  errors.short_description ? 'border-red-500' : 'border-gray-600'
                } text-white placeholder-gray-500`}
                placeholder="Краткое описание персонажа (для карточки)..."
                disabled={isLoading}
              />
              {errors.short_description && <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {errors.short_description}
              </p>}
            </div>
          </div>
        );

      case 'description':
        return (
          <div className="space-y-5">
            {/* Description field */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
                <svg className="w-4 h-4 inline mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                Описание <span className="text-red-400">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={10}
                className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-y text-sm ${
                  errors.description ? 'border-red-500' : 'border-gray-600'
                } text-white placeholder-gray-500`}
                placeholder="Подробное описание персонажа, его история, внешность, контекст..."
                disabled={isLoading}
              />
              {errors.description && <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {errors.description}
              </p>}
            </div>
          </div>
        );

      case 'personality':
        return (
          <div className="space-y-5">
            {/* Personality field */}
            <div>
              <label htmlFor="personality" className="block text-sm font-medium text-gray-300 mb-2">
                <svg className="w-4 h-4 inline mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Личность
              </label>
              <textarea
                id="personality"
                name="personality"
                value={formData.personality}
                onChange={handleInputChange}
                rows={8}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-y text-sm text-white placeholder-gray-500"
                placeholder="Характер, черты личности, манера речи, привычки, страхи, отношения с другими..."
                disabled={isLoading}
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Опишите личность персонажа: характер, манеру общения, привычки, особенности речи
              </p>
            </div>
          </div>
        );

      case 'greetings':
        return (
          <div className="space-y-4">
            {/* Greetings header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">
                  {messages.length} из 50 · Первое сообщение используется при начале чата
                </p>
              </div>
              {messages.length < 50 && (
                <button
                  onClick={addMessage}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Добавить
                </button>
              )}
            </div>

            {/* Error message */}
            {greetingsError && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-400 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {greetingsError}
              </div>
            )}

            {/* Loading state */}
            {greetingsLoading && messages.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : (
              /* Messages list */
              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`bg-gray-700/50 rounded-lg border transition-all ${
                      index === 0
                        ? 'border-yellow-500/50 shadow-sm'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    {/* Message header */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-600/50">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded ${
                            index === 0
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-gray-600 text-gray-300'
                          }`}
                        >
                          {index + 1}
                          {index === 0 && ' · Активное'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Move buttons */}
                        <button
                          onClick={() => moveMessage(index, 'up')}
                          disabled={index === 0}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-600 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Вверх"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => moveMessage(index, 'down')}
                          disabled={index === messages.length - 1}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-600 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Вниз"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {/* Delete button */}
                        {messages.length > 1 && (
                          <button
                            onClick={() => removeMessage(index)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/30 rounded transition"
                            title="Удалить"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Message textarea */}
                    <textarea
                      value={message}
                      onChange={(e) => updateMessage(index, e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 bg-gray-800/50 border-0 rounded-b-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-white text-sm resize-y placeholder-gray-500"
                      placeholder="Введите текст приветствия..."
                    />
                    
                    {/* Character count */}
                    <div className="px-4 py-1.5 border-t border-gray-600/30 flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {message.length} символов
                      </span>
                      {message.length > 0 && (
                        <div className="flex items-center gap-1 min-w-0 flex-1 ml-4">
                          <span className="text-xs text-gray-500 shrink-0">Превью:</span>
                          <span className="text-xs text-gray-400 italic truncate">
                            {getPreview(message)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Add button */}
                {messages.length < 50 && (
                  <button
                    onClick={addMessage}
                    className="w-full p-4 border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-lg text-gray-400 hover:text-white transition flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Добавить приветствие ({50 - messages.length} осталось)
                  </button>
                )}
              </div>
            )}

            {/* Save greetings button */}
            <button
              onClick={handleGreetingsSave}
              disabled={greetingsLoading || messages.every(m => !m.trim())}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition shadow-lg"
            >
              {greetingsLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Сохранение...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Сохранить приветствия
                </>
              )}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div 
        ref={modalRef}
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden border border-gray-700"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            {isEditing ? (
              <>
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 17.293a2 2 0 01-2.828 0l-2.829-2.828a2 2 0 010-2.828l8.486-8.485zM18 17h3" />
                </svg>
                Редактировать персонажа
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Создать персонажа
              </>
            )}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
            title="Закрыть (Escape)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-4 border-b border-gray-700 shrink-0">
          <div className="flex gap-1 bg-gray-900/50 rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-gray-700 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content (scrollable) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 min-h-0">
            {renderTabContent()}
          </div>
        </form>

        {/* Footer - Sticky buttons always at bottom */}
        <div className="px-5 py-4 border-t border-gray-700 bg-gray-800/95 backdrop-blur-sm shrink-0">
          <div className="flex gap-3">
            {/* Cancel button - Red */}
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading || greetingsLoading}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-red-600/90 hover:bg-red-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-bold text-white transition shadow-lg shadow-red-900/30"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Отмена
            </button>
            
            {/* Save button - Green (only show on non-greetings tab) */}
            {activeTab !== 'greetings' && (
              <button
                type="submit"
                disabled={isLoading || greetingsLoading}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-emerald-600/90 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-bold text-white transition shadow-lg shadow-emerald-900/30"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Сохранение...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Сохранить
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CharacterEditor;
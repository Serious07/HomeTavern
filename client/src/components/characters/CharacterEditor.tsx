import React, { useState, useEffect } from 'react';
import { Character } from '../../types';

interface CharacterEditorProps {
  character?: Character;
  onSave: (character: Omit<Character, 'id' | 'created_at' | 'updated_at'>) => void;
  onCancel: () => void;
}

const CharacterEditor: React.FC<CharacterEditorProps> = ({
  character,
  onSave,
  onCancel,
}) => {
  const isEditing = !!character?.id;
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    personality: '',
    first_message: '',
    system_prompt: '',
    avatar: '',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    if (character) {
      setFormData({
        name: character.name || '',
        description: character.description || '',
        personality: character.personality || '',
        first_message: character.first_message || '',
        system_prompt: character.system_prompt || '',
        avatar: character.avatar || '',
      });
      if (character.avatar) {
        setAvatarPreview(character.avatar);
      }
    }
  }, [character]);

  const validateFields = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Имя персонажа обязательно';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Описание обязательно';
    }

    if (!formData.first_message.trim()) {
      newErrors.first_message = 'Первое сообщение обязательно';
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateFields()) return;
    
    setIsLoading(true);
    
    // Remove empty system_prompt
    const { system_prompt, ...data } = formData;
    const payload = {
      ...data,
      system_prompt: system_prompt.trim() || undefined,
    };
    
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto border border-gray-700">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {isEditing ? 'Редактировать персонажа' : 'Создать персонажа'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Avatar section */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center border-2 border-gray-600">
              {avatarPreview ? (
                <img 
                  src={avatarPreview} 
                  alt="Avatar preview" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Аватар (опционально)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Name field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Имя персонажа *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition ${
                errors.name ? 'border-red-500' : 'border-gray-600'
            } text-white placeholder-gray-500`}
              placeholder="Например: Гермиона Грейнджер"
              disabled={isLoading}
            />
            {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
          </div>

          {/* Description field */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
              Описание *
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={4}
              className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition resize-none ${
                errors.description ? 'border-red-500' : 'border-gray-600'
            } text-white placeholder-gray-500`}
              placeholder="Подробное описание персонажа, его история, внешность, контекст..."
              disabled={isLoading}
            />
            {errors.description && <p className="mt-1 text-sm text-red-400">{errors.description}</p>}
          </div>

          {/* Personality field */}
          <div>
            <label htmlFor="personality" className="block text-sm font-medium text-gray-300 mb-2">
              Личность
            </label>
            <textarea
              id="personality"
              name="personality"
              value={formData.personality}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition resize-none text-white placeholder-gray-500"
              placeholder="Характер, черты личности, манера речи..."
              disabled={isLoading}
            />
          </div>

          {/* First message field */}
          <div>
            <label htmlFor="first_message" className="block text-sm font-medium text-gray-300 mb-2">
              Первое сообщение *
            </label>
            <textarea
              id="first_message"
              name="first_message"
              value={formData.first_message}
              onChange={handleInputChange}
              rows={3}
              className={`w-full px-4 py-3 bg-gray-700/50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition resize-none ${
                errors.first_message ? 'border-red-500' : 'border-gray-600'
            } text-white placeholder-gray-500`}
              placeholder="Приветственное сообщение персонажа..."
              disabled={isLoading}
            />
            {errors.first_message && <p className="mt-1 text-sm text-red-400">{errors.first_message}</p>}
          </div>

          {/* System prompt field */}
          <div>
            <label htmlFor="system_prompt" className="block text-sm font-medium text-gray-300 mb-2">
              Системный промпт
            </label>
            <textarea
              id="system_prompt"
              name="system_prompt"
              value={formData.system_prompt}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition resize-none text-white placeholder-gray-500"
              placeholder="Инструкции для ИИ (как вести себя, ограничения...)"
              disabled={isLoading}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-4 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3 px-4 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
            >
              {isLoading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CharacterEditor;

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { charactersApi, chatsApi } from '../services/api';
import { Character } from '../types';
import CharacterEditor from '../components/characters/CharacterEditor';
import AppHeader from '../components/common/AppHeader';

const CharactersPage: React.FC = () => {
  const navigate = useNavigate();
  
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | undefined>(undefined);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<number | null>(null);

  const fetchCharacters = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await charactersApi.getAll();
      setCharacters(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Требуется авторизация');
        navigate('/login');
      } else {
        setError(err.response?.data?.message || 'Ошибка при загрузке персонажей');
      }
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  const handleCreateClick = () => {
    setEditingCharacter(undefined);
    setShowEditor(true);
  };

  const handleEditClick = (character: Character) => {
    setEditingCharacter(character);
    setShowEditor(true);
  };

  const handleDeleteClick = (id: number) => {
    setCharacterToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (characterToDelete === null) return;
    
    try {
      await charactersApi.delete(characterToDelete);
      setCharacters((prev) => prev.filter((c) => c.id !== characterToDelete));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка при удалении персонажа');
    } finally {
      setIsDeleteConfirmOpen(false);
      setCharacterToDelete(null);
    }
  };

  const handleSave = async (characterData: Omit<Character, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (editingCharacter?.id) {
        // Update existing character
        await charactersApi.update(editingCharacter.id, characterData);
      } else {
        // Create new character
        await charactersApi.create(characterData);
      }
      setShowEditor(false);
      setEditingCharacter(undefined);
      fetchCharacters();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка при сохранении персонажа');
    }
  };

  const handleCancel = () => {
    setShowEditor(false);
    setEditingCharacter(undefined);
  };

  const handleImportFromSillyTavern = () => {
    console.log('[handleImportFromSillyTavern] ENTER');
    // Create a file input for importing
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          
          console.log('[handleImportFromSillyTavern] Parsed data:', {
            name: data.name,
            has_first_mes: !!data.first_mes,
            first_mes_preview: data.first_mes?.substring(0, 50),
            has_greeting: !!data.greeting,
            has_first_message: !!data.first_message,
          });
          
          // Map SillyTavern format to our format
          // SillyTavern uses "first_mes" not "first_message" or "greeting"
          const characterData = {
            name: data.name || 'Unknown Character',
            description: data.description || '',
            personality: data.personality || '',
            first_message: data.first_mes || data.first_message || data.greeting || '',
            system_prompt: '',
          };
          
          console.log('[handleImportFromSillyTavern] Character data to create:', characterData);
          
          await charactersApi.create(characterData);
          fetchCharacters();
        } catch (err: any) {
          console.error('[handleImportFromSillyTavern] Error:', err);
          alert('Ошибка при импорте: ' + (err.message || 'Неверный формат файла'));
        }
      }
    };
    input.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <AppHeader title="Персонажи" />

      {/* Main content */}
      <div className="container mx-auto px-4 py-8 pb-24 md:pb-8">
        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-red-400">{error}</p>
            {error === 'Требуется авторизация' && (
              <button
                onClick={() => navigate('/login')}
                className="mt-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-white text-sm"
              >
                Перейти на страницу входа
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-4 mb-8">
          <button
            onClick={handleCreateClick}
            className="flex items-center gap-2 px-4 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg font-semibold text-white transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать персонажа
          </button>
          <button
            onClick={handleImportFromSillyTavern}
            className="flex items-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold text-white transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Импорт из SillyTavern
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-10 w-10 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}

        {/* Characters grid */}
        {!isLoading && characters.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-20 h-20 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-gray-400 text-lg">У вас пока нет персонажей</p>
            <p className="text-gray-500 mt-2">Создайте первого персонажа!</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {characters.map((character) => (
            <div
              key={character.id}
              className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden hover:border-gray-500/50 transition group flex flex-col h-full"
            >
              {/* Card header with avatar */}
              <div className="p-4 flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden flex-shrink-0 border-2 border-gray-600">
                  {character.avatar ? (
                    <img 
                      src={character.avatar} 
                      alt={character.name} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-500">
                      <span className="text-white text-xl font-bold">
                        {character.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white truncate">
                    {character.name}
                  </h3>
                  <p className="text-gray-400 text-sm mt-1">
                    {character.short_description}
                  </p>
                </div>
              </div>

              {/* Card actions */}
              <div className="mt-auto px-4 py-3 bg-gray-800/80 border-t border-gray-700 flex items-center justify-between">
                <button
                  onClick={async () => {
                    if (!character.id) return;
                    try {
                      const response = await chatsApi.create({
                        character_id: character.id,
                        title: `Чат с ${character.name}`,
                      });
                      navigate(`/chats/${response.data.id}`);
                    } catch (err: any) {
                      console.error('Error creating chat:', err);
                      alert(err.response?.data?.message || 'Ошибка при создании чата');
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-white text-sm font-medium transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h13M8 12l-4-4m4 4l4-4m-4 4v10m-4-10H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-4" />
                  </svg>
                  Чат
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditClick(character)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
                    title="Редактировать"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 17.293a2 2 0 01-2.828 0l-2.829-2.828a2 2 0 010-2.828l8.486-8.485zM18 17h3" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteClick(character.id!)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/30 rounded-lg transition"
                    title="Удалить"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Character editor modal */}
      {showEditor && (
        <CharacterEditor
          character={editingCharacter}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {/* Delete confirmation modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Подтверждение</h3>
            <p className="text-gray-400 mb-6">
              Вы уверены, что хотите удалить этого персонажа? Это действие нельзя отменить.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold text-white transition"
              >
                Отмена
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold text-white transition"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharactersPage;

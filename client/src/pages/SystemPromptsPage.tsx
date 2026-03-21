import React, { useState, useEffect } from 'react';
import { systemPromptsApi } from '../services/api';
import { SystemPrompt } from '../types';
import SystemPromptList from '../components/system-prompts/SystemPromptList';
import SystemPromptEditor from '../components/system-prompts/SystemPromptEditor';
import AppHeader from '../components/common/AppHeader';

const SystemPromptsPage: React.FC = () => {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationResult, setMigrationResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchPrompts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await systemPromptsApi.getAll();
      setPrompts(response.data.systemPrompts);
    } catch (err) {
      console.error('Ошибка при загрузке промптов:', err);
      setError('Не удалось загрузить системные промпты');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const selectedPrompt = Array.isArray(prompts) ? prompts.find((p) => p.id === selectedId) || null : null;

  const handleSave = async (id: number, data: Partial<SystemPrompt>) => {
    try {
      setIsSaving(true);
      await systemPromptsApi.update(id, data);
      await fetchPrompts();
    } catch (err) {
      console.error('Ошибка при сохранении промпта:', err);
      alert('Не удалось сохранить промпт');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await systemPromptsApi.delete(id);
      if (selectedId === id) {
        setSelectedId(null);
      }
      await fetchPrompts();
    } catch (err) {
      console.error('Ошибка при удалении промпта:', err);
      alert('Не удалось удалить промпт');
    }
  };

  const handleActivate = async (id: number) => {
    try {
      await systemPromptsApi.activate(id);
      await fetchPrompts();
    } catch (err) {
      console.error('Ошибка при активации промпта:', err);
      alert('Не удалось активировать промпт');
    }
  };

  const handleCreateNew = async () => {
    try {
      // Создаем новый промпт с дефолтными значениями
      const response = await systemPromptsApi.create({
        name: 'Новый промпт',
        description: '',
        prompt_text: '',
      });
      
      // Выбираем созданный промпт
      setSelectedId(response.data.systemPrompt.id);
      
      // Обновляем список
      await fetchPrompts();
    } catch (err) {
      console.error('Ошибка при создании промпта:', err);
      alert('Не удалось создать новый промпт');
    }
  };

  const handleRunMigration = async () => {
    setMigrationResult(null);
    try {
      const response = await systemPromptsApi.migrate();
      setMigrationResult({
        success: true,
        message: `Миграция выполнена успешно! Создано промптов: ${response.data.migratedCount}`,
      });
    } catch (err: any) {
      console.error('Ошибка при миграции:', err);
      setMigrationResult({
        success: false,
        message: err.response?.data?.error || 'Не удалось выполнить миграцию',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <AppHeader title="Системные промпты" />
      
      <main className="pt-6 pb-8 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={handleCreateNew}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-white transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Создать новый
            </button>
            <button
              onClick={handleRunMigration}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium text-white transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5m-.581 0H19m-2.581 2.581L19 19m0 0v-5m0 0h-5m5 0h-5" />
              </svg>
              Выполнить миграцию
            </button>
          </div>

          {/* Migration result message */}
          {migrationResult && (
            <div className={`mb-4 p-4 border rounded-lg ${
              migrationResult.success
                ? 'bg-green-900/50 border-green-700 text-green-200'
                : 'bg-red-900/50 border-red-700 text-red-200'
            }`}>
              {migrationResult.message}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {/* Main content - Two column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)] min-h-[500px]">
            {/* Left column - List */}
            <div className="lg:col-span-1 bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col">
              <h2 className="text-lg font-semibold text-white mb-4">Список промптов</h2>
              <SystemPromptList
                prompts={prompts}
                selectedId={selectedId}
                onSelect={setSelectedId}
                isLoading={isLoading}
                onCreateNew={handleCreateNew}
              />
            </div>

            {/* Right column - Editor */}
            <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 p-6">
              <SystemPromptEditor
                prompt={selectedPrompt}
                onSave={handleSave}
                onDelete={handleDelete}
                onActivate={handleActivate}
                onCancel={() => setSelectedId(null)}
                isLoading={isSaving}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SystemPromptsPage;

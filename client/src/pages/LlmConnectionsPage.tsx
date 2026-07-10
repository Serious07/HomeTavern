import React, { useState, useEffect } from 'react';
import { llmConnectionsApi } from '../services/api';
import { LlmConnection, LlmTestResult } from '../types';
import AppHeader from '../components/common/AppHeader';

const LlmConnectionsPage: React.FC = () => {
  // State
  const [connections, setConnections] = useState<LlmConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingConnection, setEditingConnection] = useState<LlmConnection | null>(null);
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [showApiKeyList, setShowApiKeyList] = useState<Record<string, boolean>>({});
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  // Store temporarily fetched decrypted keys (keyed by connection id)
  const [tempKeys, setTempKeys] = useState<Record<string, string>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formMaxTokens, setFormMaxTokens] = useState(64000);
  const [formReasoning, setFormReasoning] = useState(true);
  const [formError, setFormError] = useState('');

  // Load connections on mount
  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const { data } = await llmConnectionsApi.getAll();
      setConnections(data as any);
    } catch (error) {
      console.error('Failed to load LLM connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingConnection(null);
    setFormName('');
    setFormBaseUrl('');
    setFormApiKey('');
    setFormModel('');
    setFormMaxTokens(64000);
    setFormReasoning(true);
    setFormError('');
    setShowApiKeyModal(false);
    setShowModal(true);
  };

  const openEditModal = (connection: LlmConnection) => {
    setEditingConnection(connection);
    setFormName(connection.name);
    setFormBaseUrl(connection.base_url);
    setFormApiKey(''); // Don't prefill API key for security
    setFormModel(connection.model);
    setFormMaxTokens(connection.max_tokens);
    setFormReasoning(connection.reasoning !== 0); // 1 = enabled, 0 = disabled
    setFormError('');
    setShowApiKeyModal(false);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    setFormError('');

    if (!formName || !formBaseUrl || !formModel) {
      setFormError('Название, Base URL и модель обязательны для заполнения');
      return;
    }

    // When editing, API key is optional (empty means keep existing)
    if (!editingConnection && !formApiKey) {
      setFormError('API ключ обязателен для нового подключения');
      return;
    }

    try {
      if (editingConnection) {
        const updateData: any = {
          name: formName,
          base_url: formBaseUrl,
          model: formModel,
          max_tokens: formMaxTokens,
          reasoning: formReasoning ? 1 : 0,
        };
        if (formApiKey) {
          updateData.api_key = formApiKey;
        }
        await llmConnectionsApi.update(editingConnection.id, updateData);
      } else {
        await llmConnectionsApi.create({
          name: formName,
          base_url: formBaseUrl,
          api_key: formApiKey,
          model: formModel,
          max_tokens: formMaxTokens,
          reasoning: formReasoning ? 1 : 0,
        });
      }
      setShowModal(false);
      loadConnections();
    } catch (error: any) {
      setFormError(error.response?.data?.error || 'Ошибка при сохранении');
    }
  };

  const handleActivate = async (id: number) => {
    try {
      await llmConnectionsApi.activate(id);
      // Also switch in the service
      await llmConnectionsApi.switch(id);
      loadConnections();
    } catch (error) {
      console.error('Failed to activate connection:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await llmConnectionsApi.delete(id);
      setDeleteConfirmId(null);
      loadConnections();
    } catch (error) {
      console.error('Failed to delete connection:', error);
    }
  };

  const handleToggleReasoning = async (conn: LlmConnection) => {
    const newReasoning = conn.reasoning !== 0 ? 0 : 1;
    try {
      await llmConnectionsApi.update(conn.id, { reasoning: newReasoning });
      loadConnections();
    } catch (error) {
      console.error('Failed to toggle reasoning:', error);
    }
  };

  const handleTest = async (connection: LlmConnection) => {
    setTestingId(connection.id);
    setTesting(true);
    setTestResult(null);
    try {
      // Fetch the decrypted API key first
      const { data: decrypted } = await llmConnectionsApi.getDecrypted(connection.id);
      const apiKey = (decrypted as any).api_key_decrypted || '';
      const { data } = await llmConnectionsApi.test({
        base_url: connection.base_url,
        api_key: apiKey,
        model: connection.model,
      });
      setTestResult(data as any);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: 'Test failed',
        response_time_ms: 0,
        error: error.response?.data?.error || error.message || 'Unknown error',
      });
    } finally {
      setTesting(false);
      setTestingId(null);
    }
  };

  const handleTestWithCredentials = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      let apiKey = formApiKey;

      // When editing and API key field is empty, fetch the saved key from server
      if (editingConnection && !formApiKey) {
        const { data } = await llmConnectionsApi.showKey(editingConnection.id);
        apiKey = data.api_key_decrypted || '';
      }

      if (!apiKey) {
        setTestResult({
          success: false,
          message: 'API ключ не доступен',
          response_time_ms: 0,
          error: 'Не удалось получить API ключ. Убедитесь что у подключения есть сохранённый ключ.',
        });
        return false;
      }

      const { data } = await llmConnectionsApi.test({
        base_url: formBaseUrl,
        api_key: apiKey,
        model: formModel,
      });
      setTestResult(data as any);
      return data.success;
    } catch (error: any) {
      setTestResult({
        success: false,
        message: 'Тест не прошёл',
        response_time_ms: 0,
        error: error.response?.data?.error || error.message || 'Unknown error',
      });
      return false;
    } finally {
      setTesting(false);
    }
  };

  const toggleApiKeyVisibility = async (id: number) => {
    const idStr = String(id);
    const isVisible = showApiKeyList[idStr];

    if (isVisible) {
      // Hide - clear temp key
      setShowApiKeyList(prev => ({ ...prev, [idStr]: false }));
      setTempKeys(prev => {
        const next = { ...prev };
        delete next[idStr];
        return next;
      });
    } else {
      // Show - fetch decrypted key from server
      try {
        const { data } = await llmConnectionsApi.showKey(id);
        setTempKeys(prev => ({ ...prev, [idStr]: data.api_key_decrypted || '' }));
        setShowApiKeyList(prev => ({ ...prev, [idStr]: true }));
      } catch (error) {
        console.error('Failed to fetch API key:', error);
      }
    }
  };

  const formatApiKeyDisplay = (encrypted: string | null) => {
    if (!encrypted) return 'Not set';
    return '••••••••' + encrypted.slice(-4);
  };

  // Get display key for list view (temp decrypted or masked)
  const getDisplayKeyForConn = (conn: LlmConnection): string => {
    const idStr = String(conn.id);
    if (showApiKeyList[idStr] && tempKeys[idStr]) {
      return tempKeys[idStr];
    }
    return formatApiKeyDisplay(conn.api_key_encrypted);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <AppHeader title="LLM Подключения" />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="text-white text-lg">Загрузка...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <AppHeader title="LLM Подключения" />

      <div className="container mx-auto px-4 py-8 pb-24 md:pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Header with add button */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Управление подключениями</h2>
              <p className="text-gray-400 text-sm mt-1">
                Создавайте и управляйте подключениями к LLM API
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-white transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить
            </button>
          </div>

          {/* Connections list */}
          {connections.length === 0 ? (
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-12 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
              <p className="text-gray-400 text-lg">Нет подключений</p>
              <p className="text-gray-500 text-sm mt-2">
                Нажмите "Добавить" чтобы создать первое подключение
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className={`bg-gray-800/50 rounded-2xl border p-6 transition ${
                    conn.is_active
                      ? 'border-blue-500/50 shadow-lg shadow-blue-500/10'
                      : 'border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Title and status */}
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-lg font-bold text-white">{conn.name}</h3>
                        {conn.is_active && (
                          <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/30">
                            Активное
                          </span>
                        )}
                      </div>

                      {/* Details */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          <span className="text-gray-300 text-sm font-mono">{conn.base_url}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          <span className="text-gray-300 text-sm">{conn.model}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span className="text-gray-400 text-sm font-mono break-all">
                            API Key: {getDisplayKeyForConn(conn)}
                          </span>
                          {conn.api_key_encrypted && (
                            <button
                              type="button"
                              onClick={() => toggleApiKeyVisibility(conn.id)}
                              className="text-blue-400 text-xs hover:text-blue-300 transition ml-2 whitespace-nowrap"
                            >
                              {showApiKeyList[String(conn.id)] ? 'Скрыть' : 'Показать'}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-gray-400 text-sm">Max Tokens: {conn.max_tokens.toLocaleString()}</span>
                        </div>
                        {/* Reasoning toggle */}
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          <span className="text-gray-400 text-sm">Reasoning:</span>
                          <button
                            type="button"
                            onClick={() => handleToggleReasoning(conn)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              conn.reasoning !== 0 ? 'bg-blue-600' : 'bg-gray-600'
                            }`}
                            role="switch"
                            aria-checked={conn.reasoning !== 0}
                            title={conn.reasoning !== 0 ? 'Reasoning включён (нажмите чтобы выключить)' : 'Reasoning выключен (нажмите чтобы включить)'}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                conn.reasoning !== 0 ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <span className={`text-xs font-medium ${conn.reasoning !== 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                            {conn.reasoning !== 0 ? 'Вкл' : 'Выкл'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4">
                      {!conn.is_active && (
                        <button
                          onClick={() => handleActivate(conn.id)}
                          className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-semibold text-white transition"
                          title="Активировать"
                        >
                          Активировать
                        </button>
                      )}
                      <button
                        onClick={() => handleTest(conn)}
                        disabled={testingId === conn.id}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
                        title="Тест подключения"
                      >
                        {testingId === conn.id ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          'Тест'
                        )}
                      </button>
                      <button
                        onClick={() => openEditModal(conn)}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-semibold text-white transition"
                        title="Редактировать"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {deleteConfirmId === conn.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(conn.id)}
                            className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold text-white transition"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-semibold text-white transition"
                          >
                            ✗
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(conn.id)}
                          className="px-3 py-2 bg-red-600/20 hover:bg-red-600/40 rounded-lg text-sm font-semibold text-red-400 transition"
                          title="Удалить"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Test result for this connection */}
                  {testResult && (testingId === conn.id || (!testingId && testResult.success !== undefined)) && (
                    <div className={`mt-4 p-3 rounded-lg text-sm ${
                      testResult.success
                        ? 'bg-green-900/20 border border-green-700/50 text-green-400'
                        : 'bg-red-900/20 border border-red-700/50 text-red-400'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span>{testResult.message}</span>
                        {testResult.response_time_ms > 0 && (
                          <span className="text-xs opacity-75">{testResult.response_time_ms}ms</span>
                        )}
                      </div>
                      {testResult.error && (
                        <p className="text-xs mt-1 opacity-75">{testResult.error}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-lg w-full border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-6">
              {editingConnection ? 'Редактировать подключение' : 'Новое подключение'}
            </h3>

            {/* Test result in modal */}
            {testResult && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${
                testResult.success
                  ? 'bg-green-900/20 border border-green-700/50 text-green-400'
                  : 'bg-red-900/20 border border-red-700/50 text-red-400'
              }`}>
                <div className="flex items-center justify-between">
                  <span>{testResult.message}</span>
                  {testResult.response_time_ms > 0 && (
                    <span className="text-xs opacity-75">{testResult.response_time_ms}ms</span>
                  )}
                </div>
                {testResult.error && (
                  <p className="text-xs mt-1 opacity-75">{testResult.error}</p>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Название *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="LOCAL, OPENROUTER, GOOGLE..."
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Base URL *
                </label>
                <input
                  type="url"
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder="http://localhost:8080/v1"
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  API Ключ *
                </label>
                <div className="relative">
                  <input
                    type={showApiKeyModal ? 'text' : 'password'}
                    value={formApiKey}
                    onChange={(e) => setFormApiKey(e.target.value)}
                    placeholder={editingConnection ? 'Оставьте пустым чтобы не менять' : 'sk-...'}
                    className="w-full px-4 py-3 pr-12 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeyModal(!showApiKeyModal)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition focus:outline-none"
                    tabIndex={-1}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showApiKeyModal ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      )}
                    </svg>
                  </button>
                </div>
                {editingConnection && (
                  <p className="text-xs text-gray-500 mt-1">
                    Текущий ключ: {formatApiKeyDisplay(editingConnection.api_key_encrypted)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Модель *
                </label>
                <input
                  type="text"
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  placeholder="qwen-3.5, gpt-4, etc."
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Tokens
                </label>
                <input
                  type="number"
                  value={formMaxTokens}
                  onChange={(e) => setFormMaxTokens(parseInt(e.target.value) || 64000)}
                  min="1000"
                  max="1000000"
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                />
              </div>

              {/* Reasoning Toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    Reasoning (размышления модели)
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    Модель будет показывать свои мысли перед ответом. Отключение ускоряет генерацию.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormReasoning(!formReasoning)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    formReasoning ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                  role="switch"
                  aria-checked={formReasoning}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      formReasoning ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {formError && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
                  {formError}
                </div>
              )}
            </div>

            {/* Modal actions */}
            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={handleTestWithCredentials}
                disabled={testing || !formBaseUrl || !formModel || (editingConnection ? false : !formApiKey)}
                className="px-4 py-3 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 rounded-lg font-semibold transition disabled:opacity-50"
              >
                {testing ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Тест...
                  </span>
                ) : (
                  'Тест подключения'
                )}
              </button>

              <div className="flex-1" />

              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold text-white transition"
              >
                Отмена
              </button>
              <button
                onClick={handleSubmit}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-white transition"
              >
                {editingConnection ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LlmConnectionsPage;
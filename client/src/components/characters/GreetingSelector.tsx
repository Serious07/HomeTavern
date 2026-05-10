import React, { useState, useRef, useEffect } from 'react';
import { CharacterGreeting } from '../../types';

interface GreetingSelectorProps {
  greetings: CharacterGreeting[];
  onSelect: (greetingIndex: number) => void;
  onCancel: () => void;
}

const GreetingSelector: React.FC<GreetingSelectorProps> = ({
  greetings,
  onSelect,
  onCancel,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Filter greetings by search query
  const filteredGreetings = greetings.filter((g) =>
    g.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.message.substring(0, 100).toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Show up to 50 characters for preview
  const getPreview = (message: string, maxLength: number = 80): string => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredGreetings.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSelect(filteredGreetings[selectedIndex]?.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, filteredGreetings, onCancel]);

  // Scroll selected item into view
  useEffect(() => {
    const item = itemRefs.current.get(selectedIndex);
    if (item && listRef.current) {
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = (greetingId?: number) => {
    if (greetingId !== undefined) {
      const greeting = greetings.find((g) => g.id === greetingId);
      if (greeting) {
        onSelect(greeting.sort_order);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">Выберите приветствие</h2>
            <p className="text-sm text-gray-400 mt-1">
              {greetings.length} доступн{greetings.length === 1 ? 'о' : greetings.length < 5 ? 'ы' : 'о'} вариант{greetings.length === 1 ? '' : greetings.length < 5 ? 'а' : 'ов'}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        {greetings.length > 5 && (
          <div className="px-4 py-3 border-b border-gray-700 shrink-0">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Поиск по тексту..."
                className="w-full pl-10 pr-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-white text-sm placeholder-gray-500"
              />
            </div>
          </div>
        )}

        {/* Greetings list */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0"
          style={{ maxHeight: 'calc(85vh - 220px)' }}
        >
          {filteredGreetings.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-medium">Ничего не найдено</p>
              <p className="text-sm mt-1">Попробуйте другой запрос</p>
            </div>
          ) : (
            filteredGreetings.map((greeting) => {
              const originalIndex = greetings.findIndex((g) => g.id === greeting.id);
              const isSelected = originalIndex === selectedIndex;

              return (
                <button
                  key={greeting.id}
                  ref={(el) => {
                    if (el) {
                      itemRefs.current.set(originalIndex, el);
                    } else {
                      itemRefs.current.delete(originalIndex);
                    }
                  }}
                  onClick={() => setSelectedIndex(originalIndex)}
                  className={`w-full p-4 rounded-lg text-left transition-all duration-150 ${
                    isSelected
                      ? 'bg-gray-600/50 border-2 border-gray-400 shadow-lg'
                      : 'bg-gray-700/30 border border-transparent hover:bg-gray-700/50 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Radio button */}
                    <div
                      className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                        isSelected ? 'border-gray-400 bg-gray-400' : 'border-gray-500'
                      }`}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>

                    {/* Message content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {getPreview(greeting.message, 200)}
                      </p>
                      {greeting.message.length > 200 && (
                        <span className="text-xs text-gray-500 mt-1 block">
                         ...({greeting.message.length} символов)
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                        #{originalIndex + 1}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between shrink-0">
          <div className="text-xs text-gray-500">
            ← → навигация · Enter выбрать · Esc отмена
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white transition"
            >
              Отмена
            </button>
            <button
              onClick={() => handleSelect(filteredGreetings[selectedIndex]?.id)}
              className="px-6 py-2 bg-gray-500 hover:bg-gray-400 rounded-lg font-medium text-white transition shadow-lg"
            >
              Начать чат
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GreetingSelector;
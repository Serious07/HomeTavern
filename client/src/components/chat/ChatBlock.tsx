import React, { useState } from 'react';
import { ChatBlockWithParsedIds } from '../../types/compression';
import { compressionApi } from '../../services/api';

interface ChatBlockProps {
  block: ChatBlockWithParsedIds;
  onEdit: (blockId: number, updates: { title?: string; summary?: string }) => void;
  onToggleCompression: (blockId: number, isCompressed: boolean) => void;
  onDelete: (blockId: number) => void;
  onExpand?: (block: ChatBlockWithParsedIds) => void;
  isExpanded?: boolean;
  onBlockUpdate?: (blockId: number, updatedBlock: ChatBlockWithParsedIds) => void;
}

export const ChatBlock: React.FC<ChatBlockProps> = ({
  block,
  onEdit,
  onToggleCompression,
  onDelete,
  onExpand,
  isExpanded = false,
  onBlockUpdate,
}) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Для отображения summary и title на выбранном языке
  const displayTitle = showOriginal ? block.title : (block.title_translation || block.title);
  const displaySummary = showOriginal ? block.summary : (block.summary_translation || block.summary);

  const handleEditClick = () => {
    onEdit(block.id, { title: displayTitle, summary: displaySummary });
  };

  const handleToggleCompression = () => {
    const newIsCompressed = !block.is_compressed;
    onToggleCompression(block.id, newIsCompressed);
  };

  const handleDeleteClick = () => {
    if (window.confirm('Вы уверены, что хотите удалить этот блок?')) {
      onDelete(block.id);
    }
  };

  const handleExpandClick = () => {
    if (onExpand) {
      onExpand(block);
    }
  };

  const handleToggleLanguage = async () => {
    const newShowOriginal = !showOriginal;
    setShowOriginal(newShowOriginal);

    // Если перевод еще не загружен, запрашиваем его
    if (!newShowOriginal && !block.summary_translation) {
      setIsTranslating(true);
      try {
        const response = await compressionApi.translateBlock(block.id);
        const updatedBlock = response.data;
        
        // Обновляем локальное состояние блока
        if (onBlockUpdate) {
          onBlockUpdate(block.id, {
            ...block,
            title_translation: updatedBlock.title_translation,
            summary_translation: updatedBlock.summary_translation,
          });
        }
      } catch (error) {
        console.error('Error translating block:', error);
      } finally {
        setIsTranslating(false);
      }
    }
  };

  const messageCount = block.original_message_ids.length;

  return (
    <div className="mb-4 rounded-lg border border-cyan-700 bg-cyan-900/20 p-4">
      {/* Заголовок блока */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 font-semibold">📚 {displayTitle}</span>
          <span className="text-xs text-cyan-600">({messageCount} сообщений)</span>
        </div>
        
        {/* Кнопки управления */}
        <div className="flex items-center gap-1">
          {/* Кнопка переключения языка */}
          <button
            onClick={handleToggleLanguage}
            disabled={isTranslating}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition text-xs"
            title={showOriginal ? 'Показать перевод' : 'Показать оригинал'}
          >
            {isTranslating ? '...' : (showOriginal ? 'EN' : 'RU')}
          </button>

          <button
            onClick={handleEditClick}
            className="p-1 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-800/50 rounded transition"
            title="Редактировать"
          >
            ✏️
          </button>
          <button
            onClick={handleToggleCompression}
            className={`p-1 rounded transition ${
              block.is_compressed
                ? 'text-green-400 hover:text-green-300 hover:bg-green-900/50'
                : 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/50'
            }`}
            title={block.is_compressed ? 'Сжатие ВКЛ' : 'Сжатие ВЫКЛ'}
          >
            {block.is_compressed ? '🔄 Сжатие: ВКЛ' : '🔄 Сжатие: ВЫКЛ'}
          </button>
          <button
            onClick={handleDeleteClick}
            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/50 rounded transition"
            title="Удалить блок"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Краткий пересказ */}
      <div className="text-sm text-cyan-100/80 mb-3">
        <div className="font-medium text-cyan-300 mb-1">Краткий пересказ:</div>
        <p className="whitespace-pre-wrap">{displaySummary}</p>
      </div>

      {/* Кнопка развернуть */}
      {onExpand && !isExpanded && (
        <button
          onClick={handleExpandClick}
          className="text-xs text-cyan-400 hover:text-cyan-300 transition"
        >
          ▼ Развернуть оригинальные сообщения ({messageCount})
        </button>
      )}
    </div>
  );
};

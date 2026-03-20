import React from 'react';
import { ChatBlockWithParsedIds } from '../../types/compression';

interface ChatBlockProps {
  block: ChatBlockWithParsedIds;
  onEdit: (blockId: number, updates: { title?: string; summary?: string }) => void;
  onToggleCompression: (blockId: number, isCompressed: boolean) => void;
  onDelete: (blockId: number) => void;
  onExpand?: (block: ChatBlockWithParsedIds) => void;
  isExpanded?: boolean;
}

export const ChatBlock: React.FC<ChatBlockProps> = ({
  block,
  onEdit,
  onToggleCompression,
  onDelete,
  onExpand,
  isExpanded = false,
}) => {
  const handleEditClick = () => {
    onEdit(block.id, { title: block.title, summary: block.summary });
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

  const messageCount = block.original_message_ids.length;

  return (
    <div className="mb-4 rounded-lg border border-cyan-700 bg-cyan-900/20 p-4">
      {/* Заголовок блока */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 font-semibold">📚 {block.title}</span>
          <span className="text-xs text-cyan-600">({messageCount} сообщений)</span>
        </div>
        
        {/* Кнопки управления */}
        <div className="flex items-center gap-1">
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
        <p className="whitespace-pre-wrap">{block.summary}</p>
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

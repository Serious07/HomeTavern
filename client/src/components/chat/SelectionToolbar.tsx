import React from 'react';
import { MessageSelection } from '../../types/compression';

interface SelectionToolbarProps {
  isActive: boolean;
  selection: MessageSelection | null;
  onCancelSelection: () => void;
  onConfirmSelection: () => void;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  isActive,
  selection,
  onCancelSelection,
  onConfirmSelection,
}) => {
  if (!isActive) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 border border-cyan-700 rounded-lg shadow-xl p-4 z-40">
      <div className="flex items-center gap-4">
        {selection ? (
          <>
            <div className="text-cyan-300">
              Выделено сообщений: <span className="font-bold">{selection.messageCount}</span>
            </div>
            <div className="text-sm text-gray-400">
              Диапазон: #{selection.startMessageId} - #{selection.endMessageId}
            </div>
            <button
              onClick={onConfirmSelection}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded transition"
            >
              Сжать выбранные
            </button>
          </>
        ) : (
          <div className="text-cyan-300">
            Нажмите на первое сообщение для начала выделения
          </div>
        )}
        
        <button
          onClick={onCancelSelection}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};

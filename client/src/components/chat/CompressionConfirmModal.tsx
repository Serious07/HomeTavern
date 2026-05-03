import React from 'react';

interface CompressionConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  isCompressing: boolean;
}

const CompressionConfirmModal: React.FC<CompressionConfirmModalProps> = ({
  onConfirm,
  onCancel,
  isCompressing,
}) => {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Заголовок */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-700">
          <div className="w-10 h-10 rounded-full bg-yellow-900/50 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white">Подтверждение сжатия</h2>
        </div>

        {/* Содержимое */}
        <div className="p-4 space-y-4">
          <p className="text-gray-300">
            Процесс сжатия истории чата может занять значительное время в зависимости от скорости вашей LLM-модели.
          </p>
          
          <div className="bg-gray-900/50 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-400">
                Будет обработана вся история чата
              </p>
            </div>
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-400">
                Вы увидите прогресс-бар с отображением текущего статуса
              </p>
            </div>
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-yellow-400">
                Не закрывайте страницу во время сжатия
              </p>
            </div>
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition"
            disabled={isCompressing}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded transition flex items-center gap-2"
            disabled={isCompressing}
          >
            {isCompressing ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Обработка...
              </>
            ) : (
              'Запустить'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompressionConfirmModal;
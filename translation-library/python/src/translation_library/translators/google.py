"""
Переводчик Google Translate
Основан на реализации из SillyTavern
"""

from typing import Optional

from deep_translator import GoogleTranslator as DeepTranslatorGoogleTranslator

from .base import BaseTranslator
from ..types import (
    TranslationOptions,
    TranslationResult,
    TranslationError,
    TranslatorProvider,
)
from ..chunker import chunk_with_links, restore_text_with_links


class GoogleTranslator(BaseTranslator):
    """Переводчик Google Translate"""
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        timeout: int = 30000,
        retries: int = 3,
        chunk_size: int = 5000,
    ):
        super().__init__(
            provider=TranslatorProvider.GOOGLE,
            api_key=api_key,
            endpoint=endpoint,
            timeout=timeout,
            retries=retries,
        )
        self.chunk_size = chunk_size
    
    def translate(self, text: str, options: TranslationOptions) -> TranslationResult:
        """
        Выполняет перевод текста с использованием Google Translate
        
        Args:
            text: Текст для перевода
            options: Опции перевода
            
        Returns:
            Результат перевода
        """
        self.validate_input(text, options.target_language)
        
        target_lang = self.normalize_language_code(options.target_language)
        normalized_target_lang = self.normalize_google_language_code(target_lang)
        
        # Определяем исходный язык, если не указан
        source_lang = options.source_language
        if not source_lang or source_lang == 'auto':
            source_lang = self.detect_language(text)
        
        try:
            # Разделяем текст на чанки для обработки
            chunks, links = chunk_with_links(text, self.chunk_size)
            
            translated_chunks = []
            
            for chunk in chunks:
                if not chunk.strip():
                    continue
                
                translated_chunk = self._translate_chunk(chunk, source_lang, normalized_target_lang)
                translated_chunks.append(translated_chunk)
            
            # Восстанавливаем текст с сохранением ссылок
            translated_text = restore_text_with_links(translated_chunks, links)
            
            return TranslationResult(
                text=translated_text,
                source_language=source_lang,
                provider=self.provider,
            )
        except TranslationError:
            raise
        except Exception as error:
            raise self.create_error(
                f'Google Translate translation failed: {str(error)}',
                details=error
            )
    
    def _translate_chunk(self, chunk: str, source_lang: str, target_lang: str) -> str:
        """
        Переводит один чанк текста
        
        Args:
            chunk: Текст для перевода
            source_lang: Исходный язык
            target_lang: Целевой язык
            
        Returns:
            Переведённый текст
        """
        try:
            # deep-translator API: DeepTranslatorGoogleTranslator(source=source_lang, target=target_lang).translate(chunk)
            translator = DeepTranslatorGoogleTranslator(source=source_lang, target=target_lang)
            result = translator.translate(chunk)
            return result
        except Exception as error:
            raise self.create_error(
                f'Failed to translate chunk: {str(error)}',
                details=error
            )
    
    def normalize_google_language_code(self, lang: str) -> str:
        """
        Нормализует код языка для Google Translate
        
        Args:
            lang: Код языка
            
        Returns:
            Нормализованный код
        """
        # Специфичные преобразования для Google Translate
        google_language_map = {
            'zh': 'zh-CN',  # Google предпочитает zh-CN для упрощённого китайского
            'pt': 'pt',     # Google использует 'pt' для португальского
        }
        
        return google_language_map.get(lang, lang)
    
    def detect_language(self, text: str) -> str:
        """
        Определяет язык текста
        
        Args:
            text: Текст для определения языка
            
        Returns:
            Код языка
        """
        try:
            # deep-translator поддерживает 'auto' для определения языка
            translator = DeepTranslatorGoogleTranslator(source='auto', target='en')
            translator.translate(text)
            return translator.source or 'unknown'
        except Exception:
            return 'unknown'
    
    def get_supported_languages(self) -> list[str]:
        """
        Получает список поддерживаемых языков
        
        Returns:
            Список языков
        """
        # Google Translate поддерживает более 100 языков
        return [
            'af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn', 'bs',
            'bg', 'ca', 'zh-CN', 'zh-TW', 'hr', 'cs', 'da', 'nl', 'en',
            'eo', 'et', 'fi', 'fr', 'gl', 'ka', 'de', 'el', 'gu', 'ht',
            'he', 'hi', 'hu', 'is', 'id', 'ga', 'it', 'ja', 'jw', 'kn',
            'kk', 'km', 'ko', 'ku', 'ky', 'lo', 'la', 'lv', 'lt', 'mk',
            'ms', 'ml', 'mt', 'mi', 'mr', 'mn', 'my', 'ne', 'no', 'fa',
            'pl', 'pt', 'pa', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sw',
            'sv', 'tl', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi',
            'cy', 'yi', 'zu',
        ]
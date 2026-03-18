"""
Переводчик LibreTranslate
Основан на реализации из SillyTavern
"""

import requests
from typing import Optional

from .base import BaseTranslator
from ..types import (
    TranslationOptions,
    TranslationResult,
    TranslationError,
    TranslatorProvider,
)
from ..chunker import chunk_with_links, restore_text_with_links


class LibreTranslator(BaseTranslator):
    """Переводчик LibreTranslate (самостоятельный хостинг)"""
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        timeout: int = 30000,
        retries: int = 3,
        chunk_size: int = 5000,
    ):
        super().__init__(
            provider=TranslatorProvider.LIBRETRANSLATE,
            api_key=api_key,
            endpoint=endpoint,
            timeout=timeout,
            retries=retries,
        )
        self.chunk_size = chunk_size
    
    def translate(self, text: str, options: TranslationOptions) -> TranslationResult:
        """
        Выполняет перевод текста с использованием LibreTranslate
        
        Args:
            text: Текст для перевода
            options: Опции перевода
            
        Returns:
            Результат перевода
        """
        self.validate_input(text, options.target_language)
        
        source_lang = options.source_language or 'auto'
        target_lang = self.normalize_language_code(options.target_language)
        
        try:
            # Разделяем текст на чанки для обработки
            chunks, links = chunk_with_links(text, self.chunk_size)
            
            translated_chunks = []
            
            for chunk in chunks:
                if not chunk.strip():
                    continue
                
                translated_chunk = self._translate_chunk(chunk, source_lang, target_lang)
                translated_chunks.append(translated_chunk)
            
            # Восстанавливаем текст с сохранением ссылок
            translated_text = restore_text_with_links(translated_chunks, links)
            
            # Определяем исходный язык (если был auto)
            detected_lang = source_lang
            if source_lang == 'auto':
                detected_lang = self.detect_language(text)
            
            return TranslationResult(
                text=translated_text,
                source_language=detected_lang,
                provider=self.provider,
            )
        except TranslationError:
            raise
        except Exception as error:
            raise self.create_error(
                f'LibreTranslate translation failed: {str(error)}',
                details=error
            )
    
    def _translate_chunk(
        self,
        chunk: str,
        source_lang: str,
        target_lang: str,
    ) -> str:
        """
        Переводит один чанк текста
        
        Args:
            chunk: Текст для перевода
            source_lang: Исходный язык
            target_lang: Целевой язык
            
        Returns:
            Переведённый текст
        """
        url = self.endpoint or 'http://localhost:5000/translate'
        
        data = {
            'q': chunk,
            'source': source_lang,
            'target': target_lang,
            'format': 'text',
            'alternatives': 3,
        }
        
        if self.api_key:
            data['api_key'] = self.api_key
        
        try:
            response = requests.post(url, data=data, timeout=self.timeout / 1000)
            
            if response.status_code != 200:
                raise self.create_error(
                    f'LibreTranslate API error: {response.status_code}',
                    status_code=response.status_code,
                )
            
            result = response.json()
            
            if 'error' in result:
                raise self.create_error(
                    result['error'],
                    details=result
                )
            
            if 'translatedText' not in result:
                raise self.create_error(
                    'Invalid response from LibreTranslate API',
                    details=result
                )
            
            return result['translatedText']
        except requests.RequestException as error:
            raise self.create_error(
                f'Network error: {str(error)}',
                details=error
            )
    
    def detect_language(self, text: str) -> str:
        """
        Определяет язык текста
        
        Args:
            text: Текст для определения языка
            
        Returns:
            Код языка
        """
        url = self.endpoint.replace('/translate', '/detect') if self.endpoint else 'https://libretranslate.de/detect'
        
        data = {'q': text}
        
        if self.api_key:
            data['api_key'] = self.api_key
        
        try:
            response = requests.post(url, data=data, timeout=self.timeout / 1000)
            
            if response.status_code != 200:
                raise self.create_error(
                    f'LibreTranslate API error: {response.status_code}',
                    status_code=response.status_code,
                )
            
            result = response.json()
            
            if 'error' in result:
                raise self.create_error(
                    result['error'],
                    details=result
                )
            
            if not result or len(result) == 0:
                raise self.create_error(
                    'Unable to detect language',
                    details=result
                )
            
            return result[0]['language']
        except requests.RequestException as error:
            raise self.create_error(
                f'Network error: {str(error)}',
                details=error
            )
    
    def get_supported_languages(self) -> list[str]:
        """
        Получает список поддерживаемых языков
        
        Returns:
            Список языков
        """
        url = 'https://libretranslate.de/languages'
        
        try:
            response = requests.get(url, timeout=self.timeout / 1000)
            
            if response.status_code != 200:
                raise self.create_error(
                    f'LibreTranslate API error: {response.status_code}',
                    status_code=response.status_code,
                )
            
            result = response.json()
            
            if not isinstance(result, list):
                raise self.create_error(
                    'Invalid response from LibreTranslate API',
                    details=result
                )
            
            return [lang['code'] for lang in result]
        except requests.RequestException as error:
            raise self.create_error(
                f'Network error: {str(error)}',
                details=error
            )
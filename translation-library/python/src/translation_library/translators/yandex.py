"""
Переводчик Yandex Translate
Основан на реализации из SillyTavern
"""

import uuid
from typing import Optional

import requests

from .base import BaseTranslator
from ..types import (
    TranslationOptions,
    TranslationResult,
    TranslationError,
    TranslatorProvider,
)
from ..chunker import chunk_with_links, restore_text_with_links


class YandexTranslator(BaseTranslator):
    """Переводчик Yandex Translate"""
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        timeout: int = 30000,
        retries: int = 3,
        chunk_size: int = 5000,
    ):
        super().__init__(
            provider=TranslatorProvider.YANDEX,
            api_key=api_key,
            endpoint=endpoint,
            timeout=timeout,
            retries=retries,
        )
        self.chunk_size = chunk_size
    
    def translate(self, text: str, options: TranslationOptions) -> TranslationResult:
        """
        Выполняет перевод текста с использованием Yandex Translate
        
        Args:
            text: Текст для перевода
            options: Опции перевода
            
        Returns:
            Результат перевода
        """
        self.validate_input(text, options.target_language)
        
        target_lang = self.normalize_language_code(options.target_language)
        
        try:
            # Разделяем текст на чанки для обработки
            chunks, links = chunk_with_links(text, self.chunk_size)
            
            translated_chunks = []
            
            for chunk in chunks:
                if not chunk.strip():
                    continue
                
                translated_chunk = self._translate_chunk(chunk, target_lang)
                translated_chunks.append(translated_chunk)
            
            # Восстанавливаем текст с сохранением ссылок
            translated_text = restore_text_with_links(translated_chunks, links)
            
            return TranslationResult(
                text=translated_text,
                source_language=None,  # Yandex определяет язык автоматически
                provider=self.provider,
            )
        except TranslationError:
            raise
        except Exception as error:
            raise self.create_error(
                f'Yandex Translate translation failed: {str(error)}',
                details=error
            )
    
    def _translate_chunk(self, chunk: str, target_lang: str) -> str:
        """
        Переводит один чанк текста
        
        Args:
            chunk: Текст для перевода
            target_lang: Целевой язык
            
        Returns:
            Переведённый текст
        """
        # Используем публичный API Yandex без API ключа, как в SillyTavern
        url = 'https://translate.yandex.net/api/v1/tr.json/translate'
        
        # Генерируем уникальный идентификатор
        ucid = str(uuid.uuid4()).replace('-', '')
        
        params = {
            'ucid': ucid,
            'srv': 'android',
            'format': 'text',
            'text': chunk,
            'lang': target_lang,
        }
        
        try:
            response = requests.post(url, data=params, timeout=self.timeout / 1000)
            
            if response.status_code != 200:
                raise self.create_error(
                    f'Yandex Translate API error: {response.status_code} - {response.text}',
                    status_code=response.status_code,
                )
            
            result = response.json()
            
            if 'code' in result and result['code'] != 200:
                raise self.create_error(
                    f'Yandex Translate API error: {result.get("message", "Unknown error")}',
                    status_code=result.get('code'),
                    details=result
                )
            
            if 'text' not in result:
                raise self.create_error(
                    'Invalid response from Yandex Translate API',
                    details=result
                )
            
            return result['text'][0]
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
        # Используем публичный API Yandex без API ключа, как в SillyTavern
        url = 'https://translate.yandex.net/api/v1/tr.json/translate'
        
        # Генерируем уникальный идентификатор
        ucid = str(uuid.uuid4()).replace('-', '')
        
        params = {
            'ucid': ucid,
            'srv': 'android',
            'format': 'text',
            'text': text,
            'lang': 'auto',
        }
        
        try:
            response = requests.post(url, data=params, timeout=self.timeout / 1000)
            
            if response.status_code != 200:
                raise self.create_error(
                    f'Yandex Translate API error: {response.status_code} - {response.text}',
                    status_code=response.status_code,
                )
            
            result = response.json()
            
            if 'code' in result and result['code'] != 200:
                raise self.create_error(
                    f'Yandex Translate API error: {result.get("message", "Unknown error")}',
                    status_code=result.get('code'),
                    details=result
                )
            
            if 'lang' not in result:
                raise self.create_error(
                    'Invalid response from Yandex Translate API',
                    details=result
                )
            
            return result['lang'].split('-')[0]
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
        return [
            'af', 'sq', 'am', 'ar', 'hy', 'az', 'be', 'bn', 'bg', 'ca',
            'ceb', 'zh-CN', 'co', 'cs', 'da', 'nl', 'en', 'eo', 'et',
            'fi', 'fr', 'fy', 'gl', 'ka', 'de', 'el', 'gu', 'ht', 'ha',
            'haw', 'he', 'hi', 'hmn', 'hu', 'is', 'ig', 'id', 'ga', 'it',
            'ja', 'jv', 'kn', 'kk', 'km', 'rw', 'ko', 'ku', 'ky', 'lo',
            'la', 'lv', 'lt', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'mi',
            'mr', 'mn', 'my', 'ne', 'no', 'ny', 'or', 'ps', 'fa', 'pl',
            'pt', 'pa', 'ro', 'ru', 'sm', 'gd', 'sr', 'st', 'sn', 'sd',
            'si', 'sk', 'sl', 'so', 'es', 'su', 'sw', 'sv', 'tg', 'ta',
            'tt', 'te', 'th', 'tr', 'tk', 'uk', 'ur', 'ug', 'uz', 'vi',
            'cy', 'xh', 'yi', 'yo', 'zu',
        ]
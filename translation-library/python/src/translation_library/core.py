"""
Основной модуль библиотеки перевода
"""

import asyncio
from typing import Optional, List, Dict, Any

from .types import (
    TranslationOptions,
    TranslationResult,
    TranslationError,
    TranslatorProvider,
)
from .translators.google import GoogleTranslator
from .translators.yandex import YandexTranslator
from .translators.libretranslate import LibreTranslator
from .chunker import chunk_with_links, restore_text_with_links


class TranslationLibrary:
    """
    Основная библиотека перевода
    Предоставляет унифицированный интерфейс для работы с различными сервисами перевода
    """
    
    def __init__(
        self,
        default_provider: Optional[TranslatorProvider] = None,
        default_api_key: Optional[str] = None,
        default_endpoint: Optional[str] = None,
        default_timeout: int = 30000,
        default_retries: int = 3,
    ):
        """
        Инициализирует библиотеку перевода
        
        Args:
            default_provider: Провайдер по умолчанию
            default_api_key: API ключ по умолчанию
            default_endpoint: Endpoint по умолчанию
            default_timeout: Таймаут по умолчанию (мс)
            default_retries: Количество попыток по умолчанию
        """
        self.default_provider = default_provider
        self.default_api_key = default_api_key
        self.default_endpoint = default_endpoint
        self.default_timeout = default_timeout
        self.default_retries = default_retries
        
        self._translators: Dict[TranslatorProvider, Any] = {}
    
    def get_translator(self, provider: TranslatorProvider) -> Any:
        """
        Получает переводчик для указанного провайдера
        
        Args:
            provider: Провайдер перевода
            
        Returns:
            Экземпляр переводчика
        """
        if provider in self._translators:
            return self._translators[provider]
        
        translator = None
        
        if provider == TranslatorProvider.GOOGLE:
            translator = GoogleTranslator(
                api_key=self.default_api_key,
                endpoint=self.default_endpoint,
                timeout=self.default_timeout,
                retries=self.default_retries,
            )
        elif provider == TranslatorProvider.YANDEX:
            translator = YandexTranslator(
                api_key=self.default_api_key,
                endpoint=self.default_endpoint,
                timeout=self.default_timeout,
                retries=self.default_retries,
            )
        elif provider == TranslatorProvider.LIBRETRANSLATE:
            translator = LibreTranslator(
                api_key=self.default_api_key,
                endpoint=self.default_endpoint,
                timeout=self.default_timeout,
                retries=self.default_retries,
            )
        
        if translator is None:
            raise TranslationError(
                f'Unknown provider: {provider}',
                provider
            )
        
        self._translators[provider] = translator
        return translator
    
    def translate(
        self,
        text: str,
        target_language: str,
        source_language: Optional[str] = None,
        provider: Optional[TranslatorProvider] = None,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        timeout: Optional[int] = None,
        retries: Optional[int] = None,
    ) -> TranslationResult:
        """
        Выполняет перевод текста
        
        Args:
            text: Текст для перевода
            target_language: Целевой язык
            source_language: Исходный язык (опционально)
            provider: Провайдер перевода (по умолчанию используется default_provider)
            api_key: API ключ (по умолчанию используется default_api_key)
            endpoint: Endpoint (по умолчанию используется default_endpoint)
            timeout: Таймаут (по умолчанию используется default_timeout)
            retries: Количество попыток (по умолчанию используется default_retries)
            
        Returns:
            Результат перевода
        """
        provider = provider or self.default_provider
        
        if provider is None:
            raise TranslationError(
                'No provider specified. Please specify a provider or set a default provider.',
                None
            )
        
        translator = self.get_translator(provider)
        
        options = TranslationOptions(
            target_language=target_language,
            source_language=source_language,
        )
        
        return translator.translate(text, options)
    
    async def translate_async(
        self,
        text: str,
        target_language: str,
        source_language: Optional[str] = None,
        provider: Optional[TranslatorProvider] = None,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        timeout: Optional[int] = None,
        retries: Optional[int] = None,
    ) -> TranslationResult:
        """
        Выполняет перевод текста (асинхронная версия)
        
        Args:
            text: Текст для перевода
            target_language: Целевой язык
            source_language: Исходный язык (опционально)
            provider: Провайдер перевода (по умолчанию используется default_provider)
            api_key: API ключ (по умолчанию используется default_api_key)
            endpoint: Endpoint (по умолчанию используется default_endpoint)
            timeout: Таймаут (по умолчанию используется default_timeout)
            retries: Количество попыток (по умолчанию используется default_retries)
            
        Returns:
            Результат перевода
        """
        provider = provider or self.default_provider
        
        if provider is None:
            raise TranslationError(
                'No provider specified. Please specify a provider or set a default provider.',
                None
            )
        
        translator = self.get_translator(provider)
        
        options = TranslationOptions(
            target_language=target_language,
            source_language=source_language,
        )
        
        # Для LibreTranslator используем асинхронный метод
        if provider == TranslatorProvider.LIBRETRANSLATE:
            return await translator.translate(text, options)
        
        # Для других провайдеров используем синхронный метод
        return translator.translate(text, options)
    
    def detect_language(
        self,
        text: str,
        provider: Optional[TranslatorProvider] = None,
    ) -> str:
        """
        Определяет язык текста
        
        Args:
            text: Текст для определения языка
            provider: Провайдер перевода
            
        Returns:
            Код языка
        """
        provider = provider or self.default_provider
        
        if provider is None:
            raise TranslationError(
                'No provider specified. Please specify a provider or set a default provider.',
                None
            )
        
        translator = self.get_translator(provider)
        return translator.detect_language(text)
    
    async def detect_language_async(
        self,
        text: str,
        provider: Optional[TranslatorProvider] = None,
    ) -> str:
        """
        Определяет язык текста (асинхронная версия)
        
        Args:
            text: Текст для определения языка
            provider: Провайдер перевода
            
        Returns:
            Код языка
        """
        provider = provider or self.default_provider
        
        if provider is None:
            raise TranslationError(
                'No provider specified. Please specify a provider or set a default provider.',
                None
            )
        
        translator = self.get_translator(provider)
        
        # Для LibreTranslator используем асинхронный метод
        if provider == TranslatorProvider.LIBRETRANSLATE:
            return await translator.detect_language(text)
        
        # Для других провайдеров используем синхронный метод
        return translator.detect_language(text)
    
    def get_supported_languages(
        self,
        provider: Optional[TranslatorProvider] = None,
    ) -> List[str]:
        """
        Получает список поддерживаемых языков
        
        Args:
            provider: Провайдер перевода
            
        Returns:
            Список языков
        """
        provider = provider or self.default_provider
        
        if provider is None:
            raise TranslationError(
                'No provider specified. Please specify a provider or set a default provider.',
                None
            )
        
        translator = self.get_translator(provider)
        return translator.get_supported_languages()
    
    async def get_supported_languages_async(
        self,
        provider: Optional[TranslatorProvider] = None,
    ) -> List[str]:
        """
        Получает список поддерживаемых языков (асинхронная версия)
        
        Args:
            provider: Провайдер перевода
            
        Returns:
            Список языков
        """
        provider = provider or self.default_provider
        
        if provider is None:
            raise TranslationError(
                'No provider specified. Please specify a provider or set a default provider.',
                None
            )
        
        translator = self.get_translator(provider)
        
        # Для LibreTranslator используем асинхронный метод
        if provider == TranslatorProvider.LIBRETRANSLATE:
            return await translator.get_supported_languages()
        
        # Для других провайдеров используем синхронный метод
        return translator.get_supported_languages()
    
    async def close(self):
        """Закрывает все ресурсы"""
        for translator in self._translators.values():
            if hasattr(translator, 'close'):
                await translator.close()
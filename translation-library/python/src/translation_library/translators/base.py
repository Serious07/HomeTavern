"""
Базовый класс для всех переводчиков
"""

import abc
import time
from typing import Optional

from ..types import (
    TranslationOptions,
    TranslationResult,
    TranslationError,
    TranslatorProvider,
)


class BaseTranslator(abc.ABC):
    """Базовый класс для всех переводчиков"""
    
    def __init__(
        self,
        provider: TranslatorProvider,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        timeout: int = 30000,
        retries: int = 3,
    ):
        self.provider = provider
        self.api_key = api_key
        self.endpoint = endpoint
        self.timeout = timeout
        self.retries = retries
    
    @abc.abstractmethod
    def translate(self, text: str, options: TranslationOptions) -> TranslationResult:
        """
        Выполняет перевод текста
        
        Args:
            text: Текст для перевода
            options: Опции перевода
            
        Returns:
            Результат перевода
        """
        pass
    
    def detect_language(self, text: str) -> str:
        """
        Определяет язык текста (если поддерживается провайдером)
        
        Args:
            text: Текст для определения языка
            
        Returns:
            Код языка
            
        Raises:
            TranslationError: Если определение языка не поддерживается
        """
        raise TranslationError(
            'Language detection is not supported by this translator',
            self.provider
        )
    
    def get_supported_languages(self) -> list[str]:
        """
        Получает список поддерживаемых языков
        
        Returns:
            Список языков
            
        Raises:
            TranslationError: Если получение списка языков не поддерживается
        """
        raise TranslationError(
            'Getting supported languages is not supported by this translator',
            self.provider
        )
    
    def validate_input(self, text: str, target_language: str) -> None:
        """
        Валидирует входные данные
        
        Args:
            text: Текст для перевода
            target_language: Целевой язык
            
        Raises:
            TranslationError: Если входные данные невалидны
        """
        if not text or not text.strip():
            raise TranslationError('Text cannot be empty', self.provider)
        
        if not target_language or not target_language.strip():
            raise TranslationError('Target language cannot be empty', self.provider)
    
    def normalize_language_code(self, lang: str) -> str:
        """
        Нормализует код языка
        
        Args:
            lang: Код языка
            
        Returns:
            Нормализованный код языка
        """
        return lang.lower().strip()
    
    def request_with_retry(
        self,
        request_fn,
        attempt: int = 1
    ):
        """
        Выполняет запрос с повторными попытками
        
        Args:
            request_fn: Функция запроса
            attempt: Номер попытки
            
        Returns:
            Результат запроса
            
        Raises:
            Exception: Если все попытки исчерпаны
        """
        try:
            return request_fn()
        except Exception as error:
            if attempt < self.retries:
                print(
                    f'Translation request failed (attempt {attempt}/{self.retries}), retrying...'
                )
                # Ждём перед повторной попыткой (экспоненциальная задержка)
                delay = min(1000 * (2 ** (attempt - 1)), 5000)
                time.sleep(delay / 1000)
                return self.request_with_retry(request_fn, attempt + 1)
            raise
    
    def create_error(
        self,
        message: str,
        status_code: Optional[int] = None,
        details: Optional[object] = None,
    ) -> TranslationError:
        """
        Создаёт объект ошибки перевода
        
        Args:
            message: Сообщение об ошибке
            status_code: Код статуса HTTP (если доступен)
            details: Дополнительные детали ошибки
            
        Returns:
            TranslationError
        """
        return TranslationError(message, self.provider, status_code, details)
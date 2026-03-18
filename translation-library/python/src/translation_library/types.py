"""
Типы данных для библиотеки перевода
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any


class TranslatorProvider(str, Enum):
    """Поддерживаемые провайдеры перевода"""
    GOOGLE = "google"
    YANDEX = "yandex"
    LIBRETRANSLATE = "libre"


@dataclass
class LanguageInfo:
    """Информация о языке"""
    code: str
    name: str
    native_name: Optional[str] = None


@dataclass
class TranslationResult:
    """Результат перевода"""
    text: str
    """Переведённый текст"""
    provider: TranslatorProvider = field(repr=False)
    """Использованный провайдер"""
    source_language: Optional[str] = None
    """Определённый исходный язык (если поддерживается провайдером)"""
    tokens_used: Optional[int] = None
    """Количество использованных токенов (если доступно)"""


@dataclass
class TranslationOptions:
    """Опции для перевода"""
    target_language: str
    """Язык перевода"""
    source_language: Optional[str] = None
    """Исходный язык (опционально)"""
    chunk_size: Optional[int] = None
    """Максимальный размер чанка для разбивки текста"""
    api_key: Optional[str] = None
    """API ключ для провайдера"""
    endpoint: Optional[str] = None
    """Кастомный endpoint для self-hosted решений"""
    timeout: int = 30000
    """Таймаут запроса в миллисекундах"""
    retries: int = 3
    """Количество попыток повторного запроса при ошибке"""


@dataclass
class TranslationLibraryConfig:
    """Конфигурация библиотеки"""
    provider: TranslatorProvider
    """Провайдер перевода по умолчанию"""
    api_key: Optional[str] = None
    """API ключ для провайдера"""
    endpoint: Optional[str] = None
    """Кастомный endpoint для self-hosted решений"""
    timeout: int = 30000
    """Таймаут запроса в миллисекундах"""
    retries: int = 3
    """Количество попыток повторного запроса при ошибке"""


class TranslationError(Exception):
    """Ошибка перевода"""
    
    def __init__(
        self,
        message: str,
        provider: TranslatorProvider,
        status_code: Optional[int] = None,
        details: Optional[Any] = None
    ):
        super().__init__(message)
        self.message = message
        self.provider = provider
        self.status_code = status_code
        self.details = details


# Коды языков (ISO 639-1 с расширениями)
LANGUAGE_CODES: Dict[str, str] = {
    'zh-CN': 'zh',
    'zh-TW': 'zh',
    'pt-BR': 'pt',
    'pt-PT': 'pt',
}

# Список поддерживаемых языков
SUPPORTED_LANGUAGES: List[LanguageInfo] = [
    LanguageInfo(code='af', name='Afrikaans'),
    LanguageInfo(code='sq', name='Albanian'),
    LanguageInfo(code='am', name='Amharic'),
    LanguageInfo(code='ar', name='Arabic'),
    LanguageInfo(code='hy', name='Armenian'),
    LanguageInfo(code='az', name='Azerbaijani'),
    LanguageInfo(code='eu', name='Basque'),
    LanguageInfo(code='be', name='Belarusian'),
    LanguageInfo(code='bn', name='Bengali'),
    LanguageInfo(code='bs', name='Bosnian'),
    LanguageInfo(code='bg', name='Bulgarian'),
    LanguageInfo(code='ca', name='Catalan'),
    LanguageInfo(code='zh-CN', name='Chinese (Simplified)', native_name='简体中文'),
    LanguageInfo(code='zh-TW', name='Chinese (Traditional)', native_name='繁體中文'),
    LanguageInfo(code='hr', name='Croatian'),
    LanguageInfo(code='cs', name='Czech'),
    LanguageInfo(code='da', name='Danish'),
    LanguageInfo(code='nl', name='Dutch'),
    LanguageInfo(code='en', name='English'),
    LanguageInfo(code='eo', name='Esperanto'),
    LanguageInfo(code='et', name='Estonian'),
    LanguageInfo(code='fi', name='Finnish'),
    LanguageInfo(code='fr', name='French'),
    LanguageInfo(code='gl', name='Galician'),
    LanguageInfo(code='ka', name='Georgian'),
    LanguageInfo(code='de', name='German'),
    LanguageInfo(code='el', name='Greek'),
    LanguageInfo(code='gu', name='Gujarati'),
    LanguageInfo(code='ht', name='Haitian Creole'),
    LanguageInfo(code='he', name='Hebrew', native_name='עברית'),
    LanguageInfo(code='hi', name='Hindi'),
    LanguageInfo(code='hu', name='Hungarian'),
    LanguageInfo(code='is', name='Icelandic'),
    LanguageInfo(code='id', name='Indonesian'),
    LanguageInfo(code='ga', name='Irish'),
    LanguageInfo(code='it', name='Italian'),
    LanguageInfo(code='ja', name='Japanese', native_name='日本語'),
    LanguageInfo(code='jw', name='Javanese'),
    LanguageInfo(code='kn', name='Kannada'),
    LanguageInfo(code='kk', name='Kazakh'),
    LanguageInfo(code='km', name='Khmer'),
    LanguageInfo(code='ko', name='Korean', native_name='한국어'),
    LanguageInfo(code='ku', name='Kurdish'),
    LanguageInfo(code='ky', name='Kyrgyz'),
    LanguageInfo(code='lo', name='Lao'),
    LanguageInfo(code='la', name='Latin'),
    LanguageInfo(code='lv', name='Latvian'),
    LanguageInfo(code='lt', name='Lithuanian'),
    LanguageInfo(code='mk', name='Macedonian'),
    LanguageInfo(code='ms', name='Malay'),
    LanguageInfo(code='ml', name='Malayalam'),
    LanguageInfo(code='mt', name='Maltese'),
    LanguageInfo(code='mi', name='Maori'),
    LanguageInfo(code='mr', name='Marathi'),
    LanguageInfo(code='mn', name='Mongolian'),
    LanguageInfo(code='my', name='Myanmar (Burmese)'),
    LanguageInfo(code='ne', name='Nepali'),
    LanguageInfo(code='no', name='Norwegian'),
    LanguageInfo(code='fa', name='Persian', native_name='فارسی'),
    LanguageInfo(code='pl', name='Polish'),
    LanguageInfo(code='pt', name='Portuguese'),
    LanguageInfo(code='pt-BR', name='Portuguese (Brazil)'),
    LanguageInfo(code='pt-PT', name='Portuguese (Portugal)'),
    LanguageInfo(code='pa', name='Punjabi'),
    LanguageInfo(code='ro', name='Romanian'),
    LanguageInfo(code='ru', name='Russian', native_name='Русский'),
    LanguageInfo(code='sr', name='Serbian'),
    LanguageInfo(code='sk', name='Slovak'),
    LanguageInfo(code='sl', name='Slovenian'),
    LanguageInfo(code='es', name='Spanish'),
    LanguageInfo(code='sw', name='Swahili'),
    LanguageInfo(code='sv', name='Swedish'),
    LanguageInfo(code='tl', name='Tagalog (Filipino)'),
    LanguageInfo(code='ta', name='Tamil'),
    LanguageInfo(code='te', name='Telugu'),
    LanguageInfo(code='th', name='Thai'),
    LanguageInfo(code='tr', name='Turkish'),
    LanguageInfo(code='uk', name='Ukrainian'),
    LanguageInfo(code='ur', name='Urdu'),
    LanguageInfo(code='uz', name='Uzbek'),
    LanguageInfo(code='vi', name='Vietnamese'),
    LanguageInfo(code='cy', name='Welsh'),
    LanguageInfo(code='yi', name='Yiddish'),
    LanguageInfo(code='zu', name='Zulu'),
]


def normalize_language_code(code: str) -> str:
    """
    Нормализация кода языка
    
    Args:
        code: Код языка
        
    Returns:
        Нормализованный код языка
    """
    normalized = code.lower().strip()
    return LANGUAGE_CODES.get(normalized, normalized)


def is_valid_language_code(code: str) -> bool:
    """
    Проверка валидности кода языка
    
    Args:
        code: Код языка
        
    Returns:
        True если код валиден
    """
    normalized = code.lower().strip()
    return any(lang.code == normalized for lang in SUPPORTED_LANGUAGES)
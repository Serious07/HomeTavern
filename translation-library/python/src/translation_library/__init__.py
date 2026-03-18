"""
Библиотека перевода для Node.js и Python

Поддерживает следующие сервисы:
- Google Translate
- Yandex Translate
- LibreTranslate (самостоятельный хостинг)

Примеры использования:

    from translation_library import TranslationLibrary, TranslatorProvider

    # Создаём библиотеку
    library = TranslationLibrary(
        default_provider=TranslatorProvider.GOOGLE,
        default_api_key='your-api-key',
    )

    # Переводим текст
    result = library.translate(
        text='Hello, world!',
        target_language='ru',
    )
    print(result.text)  # Привет, мир!

    # Асинхронный перевод
    import asyncio

    async def main():
        result = await library.translate_async(
            text='Hello, world!',
            target_language='ru',
        )
        print(result.text)

    asyncio.run(main())

    # Определение языка
    lang = library.detect_language('Привет, мир!')
    print(lang)  # ru

    # Получение списка поддерживаемых языков
    languages = library.get_supported_languages()
    print(languages)
"""

__version__ = '1.0.0'
__author__ = 'Your Name'
__email__ = 'your.email@example.com'

from .types import (
    TranslationOptions,
    TranslationResult,
    TranslationError,
    TranslatorProvider,
)
from .core import TranslationLibrary

__all__ = [
    'TranslationLibrary',
    'TranslationOptions',
    'TranslationResult',
    'TranslationError',
    'TranslatorProvider',
]
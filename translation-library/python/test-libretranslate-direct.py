#!/usr/bin/env python3
"""
Прямой тест LibreTranslate через библиотеку
"""

import asyncio
import sys
sys.path.insert(0, 'src')

from translation_library import TranslationLibrary, TranslatorProvider

async def main():
    print("=== Прямой тест LibreTranslate ===\n")
    
    # Создаем библиотеку с явным указанием endpoint
    library = TranslationLibrary(
        default_provider=TranslatorProvider.LIBRETRANSLATE,
        default_endpoint='http://localhost:5000/translate',
    )
    
    # Тестируем перевод
    text = "Hello, world!"
    print(f"Исходный текст: {text}")
    
    try:
        result = library.translate(
            text=text,
            target_language='ru',
            provider=TranslatorProvider.LIBRETRANSLATE,
            endpoint='http://localhost:5000/translate',
        )
        print(f"Перевод: {result.text}")
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(main())
"""
Примеры асинхронного использования библиотеки перевода
"""

import asyncio

from translation_library import TranslationLibrary, TranslatorProvider


async def async_google_translation():
    """Асинхронный перевод с использованием Google Translate"""
    print("=== Асинхронный перевод Google Translate ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.GOOGLE,
    )
    
    result = await library.translate_async(
        text='Hello, world!',
        target_language='ru',
    )
    
    print(f'Исходный текст: Hello, world!')
    print(f'Перевод: {result.text}')
    print(f'Провайдер: {result.provider}')
    print()


async def async_libretranslate_translation():
    """Асинхронный перевод с использованием LibreTranslate"""
    print("=== Асинхронный перевод LibreTranslate ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.LIBRETRANSLATE,
        default_endpoint='https://libretranslate.de/translate',
    )
    
    result = await library.translate_async(
        text='Hello, world!',
        target_language='ru',
    )
    
    print(f'Исходный текст: Hello, world!')
    print(f'Перевод: {result.text}')
    print(f'Провайдер: {result.provider}')
    print()
    
    await library.close()


async def async_multiple_translations():
    """Асинхронный перевод нескольких текстов"""
    print("=== Асинхронный перевод нескольких текстов ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.LIBRETRANSLATE,
        default_endpoint='https://libretranslate.de/translate',
    )
    
    texts = [
        'Hello, world!',
        'Bonjour le monde!',
        'Hallo Welt!',
        'Ciao mondo!',
    ]
    
    # Создаём задачи для параллельного перевода
    tasks = [
        library.translate_async(
            text=text,
            target_language='ru',
        )
        for text in texts
    ]
    
    # Выполняем все задачи параллельно
    results = await asyncio.gather(*tasks)
    
    for i, (text, result) in enumerate(zip(texts, results)):
        print(f'{i + 1}. {text} -> {result.text}')
    print()
    
    await library.close()


async def async_language_detection():
    """Асинхронное определение языка"""
    print("=== Асинхронное определение языка ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.LIBRETRANSLATE,
        default_endpoint='https://libretranslate.de/detect',
    )
    
    test_texts = [
        'Hello, world!',
        'Привет, мир!',
        'Bonjour le monde!',
        'Hallo Welt!',
    ]
    
    # Создаём задачи для параллельного определения языка
    tasks = [
        library.detect_language_async(text=text)
        for text in test_texts
    ]
    
    # Выполняем все задачи параллельно
    results = await asyncio.gather(*tasks)
    
    for text, lang in zip(test_texts, results):
        print(f'{text} -> {lang}')
    print()
    
    await library.close()


async def async_supported_languages():
    """Асинхронное получение списка поддерживаемых языков"""
    print("=== Асинхронное получение списка поддерживаемых языков ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.LIBRETRANSLATE,
        default_endpoint='https://libretranslate.de/languages',
    )
    
    languages = await library.get_supported_languages_async()
    
    print(f'Всего поддерживаемых языков: {len(languages)}')
    print(f'Первые 10 языков: {languages[:10]}')
    print()
    
    await library.close()


async def main():
    """Основная функция"""
    await async_google_translation()
    await async_libretranslate_translation()
    await async_multiple_translations()
    await async_language_detection()
    await async_supported_languages()


if __name__ == '__main__':
    asyncio.run(main())
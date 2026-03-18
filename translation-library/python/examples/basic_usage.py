"""
Примеры базового использования библиотеки перевода
"""

from translation_library import TranslationLibrary, TranslatorProvider


def basic_google_translation():
    """Базовый перевод с использованием Google Translate"""
    print("=== Базовый перевод Google Translate ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.GOOGLE,
    )
    
    result = library.translate(
        text='Hello, world!',
        target_language='ru',
    )
    
    print(f'Исходный текст: Hello, world!')
    print(f'Перевод: {result.text}')
    print(f'Провайдер: {result.provider}')
    print()


def basic_yandex_translation():
    """Базовый перевод с использованием Yandex Translate"""
    print("=== Базовый перевод Yandex Translate ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.YANDEX,
        # API ключ можно передать здесь или через переменную окружения
        # default_api_key='your-yandex-api-key',
    )
    
    result = library.translate(
        text='Hello, world!',
        target_language='ru',
    )
    
    print(f'Исходный текст: Hello, world!')
    print(f'Перевод: {result.text}')
    print(f'Провайдер: {result.provider}')
    print()


def basic_libretranslate_translation():
    """Базовый перевод с использованием LibreTranslate"""
    print("=== Базовый перевод LibreTranslate ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.LIBRETRANSLATE,
        default_endpoint='https://libretranslate.de/translate',
    )
    
    result = library.translate(
        text='Hello, world!',
        target_language='ru',
    )
    
    print(f'Исходный текст: Hello, world!')
    print(f'Перевод: {result.text}')
    print(f'Провайдер: {result.provider}')
    print()


def translation_with_source_language():
    """Перевод с указанием исходного языка"""
    print("=== Перевод с указанием исходного языка ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.GOOGLE,
    )
    
    result = library.translate(
        text='Hello, world!',
        target_language='ru',
        source_language='en',
    )
    
    print(f'Исходный текст: Hello, world!')
    print(f'Исходный язык: en')
    print(f'Перевод: {result.text}')
    print()


def translation_with_options():
    """Перевод с использованием TranslationOptions"""
    print("=== Перевод с использованием TranslationOptions ===")
    
    from translation_library import TranslationOptions
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.GOOGLE,
    )
    
    options = TranslationOptions(
        target_language='de',
        source_language='en',
    )
    
    result = library.translate(
        text='Hello, world!',
        target_language=options.target_language,
        source_language=options.source_language,
    )
    
    print(f'Исходный текст: Hello, world!')
    print(f'Перевод: {result.text}')
    print()


def detect_language():
    """Определение языка текста"""
    print("=== Определение языка текста ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.GOOGLE,
    )
    
    test_texts = [
        'Hello, world!',
        'Привет, мир!',
        'Bonjour le monde!',
        'Hallo Welt!',
    ]
    
    for text in test_texts:
        lang = library.detect_language(text)
        print(f'Текст: {text} -> Язык: {lang}')
    print()


def get_supported_languages():
    """Получение списка поддерживаемых языков"""
    print("=== Список поддерживаемых языков (первые 10) ===")
    
    library = TranslationLibrary(
        default_provider=TranslatorProvider.GOOGLE,
    )
    
    languages = library.get_supported_languages()
    
    print(f'Всего поддерживаемых языков: {len(languages)}')
    print(f'Первые 10 языков: {languages[:10]}')
    print()


if __name__ == '__main__':
    basic_google_translation()
    # basic_yandex_translation()  # Требует API ключ
    # basic_libretranslate_translation()  # Может быть медленным
    translation_with_source_language()
    translation_with_options()
    detect_language()
    get_supported_languages()
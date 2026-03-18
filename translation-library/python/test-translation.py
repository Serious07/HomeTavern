"""
Тестовый скрипт для проверки работы библиотеки перевода
"""

from translation_library import TranslationLibrary, TranslatorProvider

# Короткий текст для перевода
short_text = 'Hello, world! This is a simple test.'

# Длинный текст для перевода
long_text = """
  Welcome to our comprehensive guide on artificial intelligence. 
  Artificial intelligence (AI) is transforming the way we live and work. 
  From healthcare to finance, AI is being used to solve complex problems 
  and improve efficiency. In this article, we will explore the key concepts 
  of AI, its applications, and the future of this exciting technology.
  
  Machine learning is a subset of AI that enables systems to learn and 
  improve from experience without being explicitly programmed. Deep learning, 
  a further subset of machine learning, uses neural networks with many layers 
  to process complex patterns in data. These technologies are powering 
  breakthroughs in natural language processing, computer vision, and robotics.
  
  The potential applications of AI are vast. In healthcare, AI algorithms 
  can analyze medical images to detect diseases earlier than human doctors. 
  In finance, AI-powered systems can detect fraudulent transactions in real-time. 
  In transportation, autonomous vehicles are being developed to reduce accidents 
  and improve traffic flow.
  
  However, AI also presents challenges. As AI systems become more sophisticated, 
  questions arise about job displacement, privacy, and ethical decision-making. 
  It is important to develop AI responsibly, ensuring that the benefits are 
  shared widely and that potential risks are managed effectively.
  
  For more information, visit our website at https://example.com/ai-guide 
  or check out our documentation at https://docs.example.com/ai.
"""

def test_python():
    """Тестирование Python библиотеки"""
    print('=== Тестирование Python библиотеки ===\n')

    # Тест с Google Translate
    print('--- Тест с Google Translate ---')
    try:
        google_library = TranslationLibrary(
            default_provider=TranslatorProvider.GOOGLE,
        )

        print('\nКороткий текст:')
        print(f'Исходный: {short_text}')
        short_result = google_library.translate(
            text=short_text,
            target_language='ru',
        )
        print(f'Перевод: {short_result.text}')

        print('\nДлинный текст:')
        print(f'Исходный: {long_text[:100]}...')
        long_result = google_library.translate(
            text=long_text,
            target_language='ru',
        )
        print(f'Перевод: {long_result.text[:200]}...')
        print(f'Всего символов в переводе: {len(long_result.text)}')
    except Exception as error:
        print(f'Ошибка Google Translate: {error}')

    # Тест с LibreTranslate
    print('\n--- Тест с LibreTranslate ---')
    try:
        libre_library = TranslationLibrary(
            default_provider=TranslatorProvider.LIBRETRANSLATE,
            default_endpoint='http://localhost:5000/translate',
        )

        print('\nКороткий текст:')
        print(f'Исходный: {short_text}')
        short_result = libre_library.translate(
            text=short_text,
            target_language='ru',
        )
        print(f'Перевод: {short_result.text}')

        print('\nДлинный текст:')
        print(f'Исходный: {long_text[:100]}...')
        long_result = libre_library.translate(
            text=long_text,
            target_language='ru',
        )
        print(f'Перевод: {long_result.text[:200]}...')
        print(f'Всего символов в переводе: {len(long_result.text)}')
    except Exception as error:
        print(f'Ошибка LibreTranslate: {error}')

    # Тест с Yandex Translate
    print('\n--- Тест с Yandex Translate ---')
    try:
        yandex_library = TranslationLibrary(
            default_provider=TranslatorProvider.YANDEX,
            # API ключ можно добавить здесь
        )

        print('\nКороткий текст:')
        print(f'Исходный: {short_text}')
        short_result = yandex_library.translate(
            text=short_text,
            target_language='ru',
        )
        print(f'Перевод: {short_result.text}')

        print('\nДлинный текст:')
        print(f'Исходный: {long_text[:100]}...')
        long_result = yandex_library.translate(
            text=long_text,
            target_language='ru',
        )
        print(f'Перевод: {long_result.text[:200]}...')
        print(f'Всего символов в переводе: {len(long_result.text)}')
    except Exception as error:
        print(f'Ошибка Yandex Translate: {error}')

if __name__ == '__main__':
    test_python()
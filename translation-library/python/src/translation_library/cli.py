"""
Командная строка для библиотеки перевода
"""

import argparse
import asyncio
import sys

from .types import TranslatorProvider
from .core import TranslationLibrary


def parse_args():
    """Парсит аргументы командной строки"""
    parser = argparse.ArgumentParser(
        description='Библиотека перевода для Node.js и Python'
    )
    
    parser.add_argument(
        'text',
        nargs='?',
        help='Текст для перевода',
    )
    
    parser.add_argument(
        '-t', '--target',
        required=True,
        help='Целевой язык (например, ru, en, de)',
    )
    
    parser.add_argument(
        '-s', '--source',
        help='Исходный язык (по умолчанию: auto)',
    )
    
    parser.add_argument(
        '-p', '--provider',
        choices=['google', 'yandex', 'libretranslate'],
        help='Провайдер перевода (по умолчанию: google)',
    )
    
    parser.add_argument(
        '-k', '--api-key',
        help='API ключ',
    )
    
    parser.add_argument(
        '-e', '--endpoint',
        help='Endpoint для LibreTranslate',
    )
    
    parser.add_argument(
        '--detect',
        action='store_true',
        help='Определить язык текста',
    )
    
    parser.add_argument(
        '--languages',
        action='store_true',
        help='Получить список поддерживаемых языков',
    )
    
    parser.add_argument(
        '--timeout',
        type=int,
        default=30000,
        help='Таймаут в миллисекундах (по умолчанию: 30000)',
    )
    
    parser.add_argument(
        '--retries',
        type=int,
        default=3,
        help='Количество попыток (по умолчанию: 3)',
    )
    
    return parser.parse_args()


def main():
    """Основная функция CLI"""
    args = parse_args()
    
    # Преобразуем provider в enum
    provider = None
    if args.provider:
        provider = TranslatorProvider[args.provider.upper()]
    
    # Создаём библиотеку
    library = TranslationLibrary(
        default_provider=provider,
        default_api_key=args.api_key,
        default_endpoint=args.endpoint,
        default_timeout=args.timeout,
        default_retries=args.retries,
    )
    
    # Определение языка
    if args.detect:
        if not args.text:
            print('Ошибка: Текст не указан', file=sys.stderr)
            sys.exit(1)
        
        try:
            lang = library.detect_language(args.text, provider)
            print(lang)
        except Exception as error:
            print(f'Ошибка: {error}', file=sys.stderr)
            sys.exit(1)
    
    # Список языков
    elif args.languages:
        try:
            languages = library.get_supported_languages(provider)
            for lang in languages:
                print(lang)
        except Exception as error:
            print(f'Ошибка: {error}', file=sys.stderr)
            sys.exit(1)
    
    # Перевод
    else:
        if not args.text:
            print('Ошибка: Текст не указан', file=sys.stderr)
            sys.exit(1)
        
        try:
            result = library.translate(
                text=args.text,
                target_language=args.target,
                source_language=args.source,
                provider=provider,
            )
            print(result.text)
        except Exception as error:
            print(f'Ошибка: {error}', file=sys.stderr)
            sys.exit(1)


if __name__ == '__main__':
    main()
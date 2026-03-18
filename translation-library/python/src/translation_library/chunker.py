"""
Модуль для разбивки текста на чанки
Основан на реализации из SillyTavern
"""

import re
from typing import List, Tuple


def chunk_text(text: str, max_size: int) -> List[str]:
    """
    Разбивает текст на чанки заданного размера
    
    Args:
        text: Текст для разбивки
        max_size: Максимальный размер чанка в символах
        
    Returns:
        Массив чанков
    """
    if not text or len(text) <= max_size:
        return [text]
    
    chunks: List[str] = []
    position = 0
    
    while position < len(text):
        # Пытаемся разбить по предложению или абзацу
        chunk_end = min(position + max_size, len(text))
        
        # Если это не конец текста, пытаемся найти границу предложения
        if chunk_end < len(text):
            # Ищем точку, восклицательный или вопросительный знак
            sentence_end = re.search(r'[.!?]\s', text[position:chunk_end])
            if sentence_end and sentence_end.start() > max_size * 0.5:
                chunk_end = position + sentence_end.end()
            else:
                # Ищем перенос строки
                newline_end = re.search(r'\n\s*', text[position:chunk_end])
                if newline_end and newline_end.start() > max_size * 0.5:
                    chunk_end = position + newline_end.start()
        
        chunk = text[position:chunk_end].strip()
        if chunk:
            chunks.append(chunk)
        
        position = chunk_end
    
    return chunks if chunks else [text]


def split_by_sentences(text: str) -> List[str]:
    """
    Разбивает текст по предложениям
    
    Args:
        text: Текст для разбивки
        
    Returns:
        Массив предложений
    """
    # Регулярное выражение для разделения по предложениям
    sentence_regex = r'([^.!?]+[.!?]+["\']?|\S+)'
    matches = re.findall(sentence_regex, text)
    
    return [s.strip() for s in matches if s.strip()]


def merge_chunks(chunks: List[str]) -> str:
    """
    Объединяет чанки обратно в текст
    
    Args:
        chunks: Массив чанков
        
    Returns:
        Объединённый текст
    """
    return ' '.join(chunks)


def chunk_with_links(text: str, max_size: int) -> Tuple[List[str], List[str]]:
    """
    Сохраняет ссылки на изображения при чанковании
    
    Args:
        text: Текст для чанкования
        max_size: Максимальный размер чанка
        
    Returns:
        Объект с чанками и ссылками
    """
    # Разделяем текст по ссылкам на изображения
    image_regex = r'!\[.*?\]\([^)]*\)'
    chunks = re.split(image_regex, text)
    links = re.findall(image_regex, text)
    
    result_chunks: List[str] = []
    result_links: List[str] = []
    
    for i, chunk in enumerate(chunks):
        if not chunk or not chunk.strip():
            continue
        
        chunk_chunks = chunk_text(chunk, max_size)
        result_chunks.extend(chunk_chunks)
        
        if i < len(links):
            result_links.append(links[i])
    
    return result_chunks, result_links


def restore_text_with_links(chunks: List[str], links: List[str]) -> str:
    """
    Восстанавливает текст из чанков с сохранением ссылок
    
    Args:
        chunks: Массив чанков
        links: Массив ссылок
        
    Returns:
        Восстановленный текст
    """
    result = ''
    for i, chunk in enumerate(chunks):
        result += chunk
        if i < len(links):
            result += links[i]
    return result


def normalize_text(text: str) -> str:
    """
    Нормализует текст для перевода
    
    Args:
        text: Текст для нормализации
        
    Returns:
        Нормализованный текст
    """
    return (text
            .replace('\r\n', '\n')  # Унифицируем переносы строк
            .replace('\t', '    ')   # Заменяем табы на пробелы
            .replace('  +', ' '))    # Убираем множественные пробелы


def is_valid_text(text: str) -> bool:
    """
    Проверка валидности текста для перевода
    
    Args:
        text: Текст для проверки
        
    Returns:
        True если текст валиден
    """
    return isinstance(text, str) and len(text) > 0
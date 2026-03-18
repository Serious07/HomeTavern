#!/usr/bin/env python3
"""
Отладочный скрипт для тестирования LibreTranslate
"""

import requests
import urllib.parse

# Тест 1: Прямой запрос с data (как в библиотеке)
print("=== Тест 1: requests.post с data ===")
url = "http://localhost:5000/translate"
data = {
    'q': 'Hello',
    'source': 'en',
    'target': 'ru',
}

try:
    response = requests.post(url, data=data, timeout=10)
    print(f"Статус: {response.status_code}")
    print(f"Заголовки: {response.headers.get('Content-Type')}")
    print(f"Ответ: {response.text}")
except Exception as e:
    print(f"Ошибка: {e}")

print("\n" + "="*50 + "\n")

# Тест 2: Прямой запрос с json (как было раньше)
print("=== Тест 2: requests.post с json ===")
try:
    response = requests.post(url, json=data, timeout=10)
    print(f"Статус: {response.status_code}")
    print(f"Заголовки: {response.headers.get('Content-Type')}")
    print(f"Ответ: {response.text}")
except Exception as e:
    print(f"Ошибка: {e}")

print("\n" + "="*50 + "\n")

# Тест 3: С urllib.parse (как в Node.js)
print("=== Тест 3: requests.post с encoded data ===")
try:
    encoded_data = urllib.parse.urlencode(data)
    response = requests.post(
        url, 
        data=encoded_data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        timeout=10
    )
    print(f"Статус: {response.status_code}")
    print(f"Заголовки: {response.headers.get('Content-Type')}")
    print(f"Ответ: {response.text}")
except Exception as e:
    print(f"Ошибка: {e}")

print("\n" + "="*50 + "\n")

# Тест 4: С api_key
print("=== Тест 4: С api_key ===")
data_with_key = {
    'q': 'Hello',
    'source': 'en',
    'target': 'ru',
    'format': 'text',
    'alternatives': 3,
    'api_key': ''
}
try:
    encoded_data = urllib.parse.urlencode(data_with_key)
    response = requests.post(
        url, 
        data=encoded_data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        timeout=10
    )
    print(f"Статус: {response.status_code}")
    print(f"Заголовки: {response.headers.get('Content-Type')}")
    print(f"Ответ: {response.text}")
except Exception as e:
    print(f"Ошибка: {e}")
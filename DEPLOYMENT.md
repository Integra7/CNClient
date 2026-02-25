# Инструкция по деплою клиента CosaNostra

## Текущая конфигурация

Клиент настроен на использование бэкенда через Serveo:
- **Бэкенд URL:** `wss://0c21e87a47645c8f-146-158-125-45.serveousercontent.com/chat`

## Варианты деплоя

### Вариант 1: GitHub Pages (⭐ Рекомендуется - бесплатно и просто)

#### Шаг 1: Подготовка

1. Создайте репозиторий на GitHub (если еще нет)
2. Запушьте код клиента

#### Шаг 2: Настройка GitHub Pages

1. В репозитории: **Settings** → **Pages**
2. **Source:** выберите ветку (например, `main`) и папку `/web/dist`
3. Сохраните

#### Шаг 3: Сборка и деплой

```bash
cd C:\Users\Integra\IdeaProjects\CNClient\web
npm run build
```

Затем закоммитьте и запушьте папку `dist`:

```bash
git add web/dist
git commit -m "Deploy client"
git push
```

#### Шаг 4: Результат

Ваш клиент будет доступен по адресу:
```
https://ВАШ_USERNAME.github.io/CNClient/
```

**Обновление адреса бэкенда:**
Если URL Serveo изменится, обновите `web/src/config.ts` и пересоберите.

---

### Вариант 2: Netlify (⭐ Автоматический деплой)

#### Шаг 1: Установка Netlify CLI

```bash
npm install -g netlify-cli
```

#### Шаг 2: Создание файла конфигурации

Создайте `netlify.toml` в корне проекта:

```toml
[build]
  base = "web"
  publish = "web/dist"
  command = "npm run build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### Шаг 3: Деплой

```bash
cd C:\Users\Integra\IdeaProjects\CNClient
netlify deploy --prod
```

Следуйте инструкциям для авторизации.

#### Шаг 4: Результат

Получите URL вида: `https://your-app.netlify.app`

**Автоматический деплой:**
Подключите GitHub репозиторий в Netlify - каждый push будет автоматически деплоиться.

---

### Вариант 3: Vercel (⭐ Быстрый и простой)

#### Шаг 1: Установка Vercel CLI

```bash
npm install -g vercel
```

#### Шаг 2: Создание конфигурации

Создайте `vercel.json` в корне проекта:

```json
{
  "buildCommand": "cd web && npm run build",
  "outputDirectory": "web/dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### Шаг 3: Деплой

```bash
cd C:\Users\Integra\IdeaProjects\CNClient
vercel --prod
```

#### Шаг 4: Результат

Получите URL вида: `https://your-app.vercel.app`

---

### Вариант 4: Serveo (для статики тоже)

Можно задеплоить статику через Serveo:

1. Соберите клиент:
   ```bash
   cd web
   npm run build
   ```

2. Запустите локальный сервер для статики:
   ```bash
   cd dist
   python -m http.server 3000
   ```
   (или используйте любой другой статический сервер)

3. Создайте туннель для статики:
   ```bash
   ssh -R 80:localhost:3000 serveo.net
   ```

4. Получите URL для клиента

**Недостаток:** Нужно держать два туннеля (бэкенд и фронтенд).

---

## Обновление адреса бэкенда

Если URL Serveo изменился, обновите `web/src/config.ts`:

```typescript
const serveoUrl = 'НОВЫЙ_URL_ОТ_SERVEO';
return `wss://${serveoUrl}/chat`;
```

Затем пересоберите и задеплойте заново.

---

## Переменные окружения (для гибкости)

Можно использовать переменные окружения для настройки адреса бэкенда.

### Для Vite (Netlify/Vercel):

Создайте файл `.env.production`:

```
VITE_WS_URL=wss://0c21e87a47645c8f-146-158-125-45.serveousercontent.com/chat
```

В `config.ts` уже есть поддержка `import.meta.env.VITE_WS_URL`.

### Для GitHub Pages:

Используйте GitHub Actions для сборки с переменными окружения, или задайте адрес напрямую в `config.ts`.

---

## Рекомендация

**Для быстрого тестирования:** Используйте **Netlify** или **Vercel** - они самые простые и быстрые.

**Для постоянного использования:** **GitHub Pages** - бесплатно, стабильно, можно настроить автоматический деплой через GitHub Actions.

---

## Быстрый старт (Netlify)

```bash
# 1. Сборка
cd C:\Users\Integra\IdeaProjects\CNClient\web
npm run build

# 2. Деплой
cd ..
npm install -g netlify-cli
netlify deploy --prod --dir=web/dist
```

Готово! 🚀

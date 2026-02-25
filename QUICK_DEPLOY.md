# Быстрый деплой клиента

## Текущий адрес бэкенда

```
wss://0c21e87a47645c8f-146-158-125-45.serveousercontent.com/chat
```

## Вариант 1: Netlify (самый простой)

### Шаг 1: Установка

```bash
npm install -g netlify-cli
```

### Шаг 2: Сборка

```bash
cd C:\Users\Integra\IdeaProjects\CNClient\web
npm run build
```

### Шаг 3: Деплой

```bash
cd ..
netlify deploy --prod --dir=web/dist
```

Следуйте инструкциям для авторизации (откроется браузер).

**Результат:** Получите URL вида `https://your-app.netlify.app`

---

## Вариант 2: Vercel (тоже простой)

### Шаг 1: Установка

```bash
npm install -g vercel
```

### Шаг 2: Сборка

```bash
cd C:\Users\Integra\IdeaProjects\CNClient\web
npm run build
```

### Шаг 3: Деплой

```bash
cd ..
vercel --prod --cwd web
```

**Результат:** Получите URL вида `https://your-app.vercel.app`

---

## Вариант 3: GitHub Pages

### Шаг 1: Сборка

```bash
cd C:\Users\Integra\IdeaProjects\CNClient\web
npm run build
```

### Шаг 2: Закоммитьте dist

```bash
cd ..
git add web/dist
git commit -m "Deploy client"
git push
```

### Шаг 3: Настройка GitHub Pages

1. GitHub → Settings → Pages
2. Source: branch `main`, folder `/web/dist`
3. Сохраните

**Результат:** `https://ВАШ_USERNAME.github.io/CNClient/`

---

## Обновление адреса бэкенда

Если URL Serveo изменился:

1. Откройте `web/src/config.ts`
2. Обновите строку:
   ```typescript
   const serveoUrl = 'НОВЫЙ_URL_ОТ_SERVEO';
   ```
3. Пересоберите и задеплойте заново

---

## Проверка

После деплоя откройте URL на телефоне - должно работать! 🚀

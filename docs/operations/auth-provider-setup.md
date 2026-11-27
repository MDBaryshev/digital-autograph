# Настройка Яндекс ID и почтового входа

Публичные способы входа: Яндекс ID и подтверждённая почта с паролем.
Google OAuth и Telegram login удалены из API и общих компонентов входа.
Telegram можно необязательно привязать после входа в настройках. Привязка
не создаёт, не продлевает и не восстанавливает сессию, не меняет пароль/почту
и не импортирует публичный профиль. VK не предлагается в интерфейсе входа.

## Конфигурация

Секреты хранятся в отдельном серверном env/Lockbox, вне Git и образов.
API теперь требует `API_PUBLIC_ORIGIN`; Google-параметры не используются.
Без включённой Telegram-привязки её ключи и callback не нужны.

- Общие: `WEB_ORIGIN`, `TRUSTED_WEB_ORIGINS`, `API_PUBLIC_ORIGIN`.
  Для staging/production нужны точные HTTPS origins одного сайта.
- Яндекс: `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`,
  `YANDEX_REDIRECT_URI=https://<api-host>/auth/yandex/callback`,
  `YANDEX_AUTH_ENABLED=true`, `YANDEX_AUTH_APPROVED=true` после настройки.
  Минимальное право текущего адаптера — `login:info`; импорт профиля выключен.
- Почта: `EMAIL_AUTH_ENABLED=true`, `UNISENDER_GO_API_KEY`,
  `AUTH_EMAIL_FROM` — подтверждённый отправитель именно Unisender Go.
  Ссылка подтверждения строится от `WEB_ORIGIN`; template ID не нужен.
- Необязательная связь Telegram: `TELEGRAM_LINK_ENABLED=true`,
  Login/OIDC `TELEGRAM_CLIENT_ID` и `TELEGRAM_CLIENT_SECRET`,
  `TELEGRAM_REDIRECT_URI=https://<api-host>/me/connections/telegram/callback`.
  Bot API token для этого не используется. Scope — `openid`, без профиля,
  телефона и разрешения отправлять сообщения.

## Перед включением

1. Применить миграции, включая `0029_email_auth`, и обновлённые runtime grants.
   API получает точечные права на credentials/challenges/rate limits и удаление
   отменённых link attempts; worker — очистку истёкших email-записей.
2. Зарегистрировать точный callback Яндекса и действующие публичные ссылки
   privacy/terms. Не объединять аккаунты по email из внешнего профиля.
3. Подтвердить отправителя и домен Go; DNS-записи SPF/DKIM взять в его кабинете.
   Возможность отключать `track_links` и `track_read` включается поддержкой Go.
   Проверить фактическое письмо без трекинга и переписывания ссылки, а не только
   ответ API о приёме в очередь. API-ключ обычного маркетингового Unisender не подходит.
4. На согласованном тестовом адресе пройти регистрацию → письмо → пароль →
   вход → восстановление. До подтверждения почты учётные данные не создаются.
   Проверить одноразовость/срок ссылки, отказ старого пароля и отзыв старых сессий.
5. Проверить `/auth/google/{start,callback}` и `/auth/telegram/{start,callback}`: 404. Анонимные запросы привязки: 401; чужой Origin: 403. Повторный callback,
   смена/отзыв сессии и callback после отвязки не должны создавать связь.

Существующие User/Order/consent records и social identities не удаляются.
Для пользователей только с прежним Google/Telegram нужен отдельный проверяемый
переход на основной credential до публичного переключения. Нельзя переносить
владение по совпадению почты, имени или Telegram username. Для новой пустой
установки этот переход не нужен. Недавнее повторное подтверждение основного
credential перед привязкой пока не реализовано; требуется активная сессия.

Оператор и обработчики данных, условия провайдеров, цели и сроки хранения
проверяются отдельно. Этот runbook не является юридическим заключением.

Источники настройки: [Яндекс ID](https://yandex.ru/dev/id/doc/ru/codes/code-url),
[Unisender Go API](https://godocs.unisender.ru/web-api-ref),
[Go DNS](https://godocs.unisender.ru/dns-setup),
[Telegram Login](https://core.telegram.org/bots/telegram-login).

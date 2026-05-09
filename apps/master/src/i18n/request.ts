import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './locales';

/**
 * Серверный resolver locale.
 *
 * Правила:
 *   - /login и /app/* — всегда `en` (signup-форма и dev-приложение
 *     должны быть английским, независимо от cookie).
 *     pathname приходит из middleware через header x-pathname.
 *   - Остальные пути (лендинг и т.п.) — cookie pc_locale → 'en'.
 *     Accept-Language НЕ учитывается, новый посетитель всегда видит en.
 */
export default getRequestConfig(async () => {
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') || '';
  const forceEn = pathname === '/login' || pathname.startsWith('/app') || pathname === '/upgrade' || pathname === '/verify-email';

  let locale = DEFAULT_LOCALE;
  if (!forceEn) {
    const jar = await cookies();
    const cookieLocale = jar.get(LOCALE_COOKIE)?.value;
    if (isLocale(cookieLocale)) locale = cookieLocale;
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});

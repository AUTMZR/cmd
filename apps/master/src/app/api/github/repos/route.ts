import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/github/repos?q=…
 * Возвращает список репо текущего юзера (его + organization-репо к которым у него доступ).
 * Для приватных нужен `repo` scope (мы запрашиваем при OAuth).
 *
 * Если у юзера нет github_access_token (signed up через email) — возвращаем 412.
 * Фронт может предложить «Connect GitHub» через redirect на /api/auth/github.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const row = await queryOne<{ github_access_token: string | null }>(
    `SELECT github_access_token FROM pc.users WHERE id = $1`, [user.id]);
  if (!row?.github_access_token) {
    return NextResponse.json({ error: 'no_github_link', connectUrl: '/api/auth/github' }, { status: 412 });
  }
  let token: string;
  try {
    token = decrypt(row.github_access_token);
  } catch {
    return NextResponse.json({ error: 'token_decrypt_failed' }, { status: 500 });
  }

  const q = req.nextUrl.searchParams.get('q') || '';
  // /user/repos с sort=updated даёт последние тронутые репо первыми — самый
  // полезный порядок для UI выбора. per_page=100 — один запрос покрывает
  // большинство юзеров; пагинацию добавим если кому-то понадобится.
  const ghRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!ghRes.ok) {
    const text = await ghRes.text().catch(() => '');
    return NextResponse.json(
      { error: 'github_api_error', status: ghRes.status, body: text.slice(0, 200) },
      { status: 502 },
    );
  }
  const list = await ghRes.json() as Array<{
    id: number; name: string; full_name: string; private: boolean;
    description: string | null; clone_url: string; default_branch: string;
    updated_at: string; language: string | null;
  }>;

  const filtered = q
    ? list.filter((r) => r.full_name.toLowerCase().includes(q.toLowerCase()))
    : list;

  return NextResponse.json({
    repos: filtered.map((r) => ({
      id: r.id, name: r.name, full_name: r.full_name,
      private: r.private, description: r.description,
      clone_url: r.clone_url, default_branch: r.default_branch,
      updated_at: r.updated_at, language: r.language,
    })),
  });
}

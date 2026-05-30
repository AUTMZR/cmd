import { describe, it, expect, afterEach } from 'vitest';
import { getActivePromos, type PromoItem } from './promo';

describe('getActivePromos', () => {
  const ORIG = process.env.AUTMZR_PROMOS_JSON;
  afterEach(() => { process.env.AUTMZR_PROMOS_JSON = ORIG; });

  it('returns [] when env is undefined', () => {
    delete process.env.AUTMZR_PROMOS_JSON;
    expect(getActivePromos()).toEqual([]);
  });

  it('returns [] when env is empty string', () => {
    process.env.AUTMZR_PROMOS_JSON = '';
    expect(getActivePromos()).toEqual([]);
  });

  it('returns [] when env is malformed JSON', () => {
    process.env.AUTMZR_PROMOS_JSON = '{not json';
    expect(getActivePromos()).toEqual([]);
  });

  it('returns parsed array for valid JSON', () => {
    const promos: PromoItem[] = [{
      id: 'gpt', title: 'GPT', description: 'desc',
      ctaUrl: 'https://gpt.autmzr.ru', ctaLabel: 'Try it',
    }];
    process.env.AUTMZR_PROMOS_JSON = JSON.stringify(promos);
    expect(getActivePromos()).toEqual(promos);
  });

  it('returns [] when JSON is not an array', () => {
    process.env.AUTMZR_PROMOS_JSON = JSON.stringify({ id: 'x' });
    expect(getActivePromos()).toEqual([]);
  });
});

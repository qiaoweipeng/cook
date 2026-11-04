import { describe, it, expect } from 'vitest';
import { joinUrl, normalizeKey, parseSupabaseKey, parseCosKey } from './paths';

describe('imageStorage/paths', () => {
  it('normalizeKey 去掉开头的斜杠', () => {
    expect(normalizeKey('/dishes/a.webp')).toBe('dishes/a.webp');
    expect(normalizeKey('dishes/a.webp')).toBe('dishes/a.webp');
    expect(normalizeKey('  //seeds/a.webp ')).toBe('seeds/a.webp');
  });

  it('joinUrl 逐段编码，保留目录分隔符', () => {
    const url = joinUrl('https://x.cos.ap-shanghai.myqcloud.com/', '/dishes/a b.webp');
    expect(url).toBe('https://x.cos.ap-shanghai.myqcloud.com/dishes/a%20b.webp');
    expect(url).not.toContain('%2F');
  });

  it('parseSupabaseKey 解析完整 URL 和相对路径', () => {
    const bucket = 'dish-images';
    expect(
      parseSupabaseKey(
        'https://abc.supabase.co/storage/v1/object/public/dish-images/dishes/a.webp',
        bucket
      )
    ).toBe('dishes/a.webp');
    expect(parseSupabaseKey('/seeds/dish_mapo_tofu.webp', bucket)).toBe(
      'seeds/dish_mapo_tofu.webp'
    );
    expect(parseSupabaseKey('ingredients/b.avif', bucket)).toBe('ingredients/b.avif');
  });

  it('parseSupabaseKey 不把外链/Base64 当 key', () => {
    const bucket = 'dish-images';
    expect(parseSupabaseKey('https://example.com/a.webp', bucket)).toBeNull();
    expect(parseSupabaseKey('data:image/webp;base64,xxx', bucket)).toBeNull();
    expect(parseSupabaseKey('', bucket)).toBeNull();
  });

  it('parseCosKey 解析本桶完整 URL 和相对路径', () => {
    const base = 'https://bigcook-1311958566.cos.ap-guangzhou.myqcloud.com';
    expect(parseCosKey(`${base}/dishes/a.webp`, base)).toBe('dishes/a.webp');
    expect(parseCosKey(`${base}/dishes/a%20b.webp`, base)).toBe('dishes/a b.webp');
    expect(parseCosKey('/dishes/a.webp', base)).toBe('dishes/a.webp');
  });

  it('parseCosKey 也认其他 COS 域名（换桶前的旧 URL）', () => {
    const base = 'https://bigcook-1311958566.cos.ap-guangzhou.myqcloud.com';
    expect(
      parseCosKey('https://old-125.cos.ap-shanghai.myqcloud.com/ingredients/b.webp', base)
    ).toBe('ingredients/b.webp');
  });

  it('parseCosKey 不把非 COS 外链/Base64 当 key', () => {
    const base = 'https://bigcook-1311958566.cos.ap-guangzhou.myqcloud.com';
    expect(parseCosKey('https://example.com/a.webp', base)).toBeNull();
    expect(parseCosKey('data:image/webp;base64,xxx', base)).toBeNull();
    expect(parseCosKey('', base)).toBeNull();
  });
});

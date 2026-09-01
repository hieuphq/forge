import { describe, expect, it } from 'bun:test';
import { ERROR_MESSAGES_EN, getUserMessage } from './index.js';

describe('getUserMessage', () => {
  it('returns the EN string for a known code', () => {
    expect(getUserMessage('common/VALIDATION_FAILED')).toBe(
      ERROR_MESSAGES_EN['common/VALIDATION_FAILED'],
    );
  });

  it('returns the EN string for a per-module code', () => {
    expect(getUserMessage('example/NOT_FOUND')).toBe(ERROR_MESSAGES_EN['example/NOT_FOUND']);
  });

  it('defaults to the "en" locale when none is passed', () => {
    expect(getUserMessage('common/NOT_FOUND')).toBe(getUserMessage('common/NOT_FOUND', 'en'));
  });

  it('falls through tier 1 (locale miss) to the EN fallback tier for a known code', () => {
    // 'Locale' only has 'en' today, so cast a made-up locale to force the
    // `locale === 'en'` branch (tier 1) to be skipped and land on the EN
    // fallback (tier 2) instead. This is the branch a mutation deleting the
    // tier-2 fallback must break.
    const unsupportedLocale = 'fr' as unknown as Parameters<typeof getUserMessage>[1];
    expect(getUserMessage('common/VALIDATION_FAILED', unsupportedLocale)).toBe(
      ERROR_MESSAGES_EN['common/VALIDATION_FAILED'],
    );
  });

  it('falls all the way through to the raw code string for an unknown code', () => {
    // Cast an unknown string as an ErrorCode to exercise the tier-3
    // defensive fallback, which is unreachable via the real `ErrorCode`
    // union (guarded by the `satisfies` check) but is still real, live
    // code that must return the raw code string.
    const unknownCode = 'totally/UNKNOWN_CODE' as unknown as Parameters<typeof getUserMessage>[0];
    expect(getUserMessage(unknownCode)).toBe('totally/UNKNOWN_CODE');
  });
});

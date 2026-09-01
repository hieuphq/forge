import { describe, expect, it } from 'bun:test';
import { ERROR_MESSAGES_EN, getUserMessage } from './index.js';

describe('getUserMessage', () => {
  it('returns the EN string for a known code', () => {
    expect(getUserMessage('common/VALIDATION_FAILED')).toBe(
      ERROR_MESSAGES_EN['common/VALIDATION_FAILED'],
    );
  });

  it('returns the EN string for an auth code', () => {
    expect(getUserMessage('auth/UNAUTHENTICATED')).toBe(ERROR_MESSAGES_EN['auth/UNAUTHENTICATED']);
  });

  it('defaults to the "en" locale when none is passed', () => {
    expect(getUserMessage('common/NOT_FOUND')).toBe(getUserMessage('common/NOT_FOUND', 'en'));
  });

  it('falls through tier 1 (locale miss) to the EN fallback tier for a known code', () => {
    const unsupportedLocale = 'fr' as unknown as Parameters<typeof getUserMessage>[1];
    expect(getUserMessage('common/VALIDATION_FAILED', unsupportedLocale)).toBe(
      ERROR_MESSAGES_EN['common/VALIDATION_FAILED'],
    );
  });

  it('falls all the way through to the raw code string for an unknown code', () => {
    const unknownCode = 'totally/UNKNOWN_CODE' as unknown as Parameters<typeof getUserMessage>[0];
    expect(getUserMessage(unknownCode)).toBe('totally/UNKNOWN_CODE');
  });
});

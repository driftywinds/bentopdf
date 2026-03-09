import type { CompareTextItem } from '../types.ts';

export function normalizeCompareText(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\u{E000}-\u{F8FF}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldAppendWithoutSpace(current: string, next: string) {
  if (!current) return true;
  if (/^[,.;:!?%)\]}]/.test(next)) return true;
  if (/^["']$/.test(next)) return true;
  if (/^['’”]/u.test(next)) return true;
  if (/[([{/"'“‘-]$/u.test(current)) return true;
  return false;
}

export function joinNormalizedText(tokens: string[]) {
  return tokens.reduce((result, token) => {
    if (!token) return result;
    if (shouldAppendWithoutSpace(result, token)) {
      return `${result}${token}`;
    }
    return `${result} ${token}`;
  }, '');
}

export function joinCompareTextItems(items: CompareTextItem[]) {
  return joinNormalizedText(items.map((item) => item.normalizedText));
}

export function isLowQualityExtractedText(text: string) {
  const normalized = normalizeCompareText(text);
  if (!normalized) return true;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const visibleCharacters = Array.from(normalized).filter(
    (character) => character.trim().length > 0
  );
  const alphaNumericCount = visibleCharacters.filter((character) =>
    /[\p{L}\p{N}]/u.test(character)
  ).length;
  const symbolCount = visibleCharacters.length - alphaNumericCount;
  const tokenWithAlphaNumericCount = tokens.filter((token) =>
    /[\p{L}\p{N}]/u.test(token)
  ).length;

  if (alphaNumericCount === 0) return true;
  if (
    visibleCharacters.length >= 12 &&
    alphaNumericCount / visibleCharacters.length < 0.45 &&
    symbolCount / visibleCharacters.length > 0.35
  ) {
    return true;
  }
  if (tokens.length >= 6 && tokenWithAlphaNumericCount / tokens.length < 0.6) {
    return true;
  }

  return false;
}

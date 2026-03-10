import { diffArrays } from 'diff';

import type {
  CharPosition,
  CompareChangeSummary,
  CompareRectangle,
  CompareTextChange,
  CompareTextItem,
  CompareWordToken,
} from '../types.ts';
import { calculateBoundingRect } from './text-normalization.ts';
import { COMPARE_GEOMETRY } from '../config.ts';

interface WordToken {
  word: string;
  compareWord: string;
  rect: CompareRectangle;
}

function getCharMap(line: CompareTextItem): CharPosition[] {
  if (line.charMap && line.charMap.length === line.normalizedText.length) {
    return line.charMap;
  }
  const charWidth = line.rect.width / Math.max(line.normalizedText.length, 1);
  return Array.from({ length: line.normalizedText.length }, (_, i) => ({
    x: line.rect.x + i * charWidth,
    width: charWidth,
  }));
}

function splitLineIntoWords(line: CompareTextItem): WordToken[] {
  if (line.wordTokens && line.wordTokens.length > 0) {
    return line.wordTokens.map((token: CompareWordToken) => ({
      word: token.word,
      compareWord: token.compareWord,
      rect: token.rect,
    }));
  }

  const words = line.normalizedText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const charMap = getCharMap(line);
  let offset = 0;

  return words.map((word) => {
    const startIndex = line.normalizedText.indexOf(word, offset);
    const endIndex = startIndex + word.length - 1;
    offset = startIndex + word.length;

    const startChar = charMap[startIndex];
    const endChar = charMap[endIndex];

    if (!startChar || !endChar) {
      const charWidth =
        line.rect.width / Math.max(line.normalizedText.length, 1);
      return {
        word,
        compareWord: word.toLowerCase(),
        rect: {
          x: line.rect.x + startIndex * charWidth,
          y: line.rect.y,
          width: word.length * charWidth,
          height: line.rect.height,
        },
      };
    }

    const x = startChar.x;
    const w = endChar.x + endChar.width - startChar.x;

    return {
      word,
      compareWord: word.toLowerCase(),
      rect: { x, y: line.rect.y, width: w, height: line.rect.height },
    };
  });
}

function groupAdjacentRects(rects: CompareRectangle[]): CompareRectangle[] {
  if (rects.length === 0) return [];

  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: CompareRectangle[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = groups[groups.length - 1];
    const lastRect = prev[prev.length - 1];
    const curr = sorted[i];
    const sameLine =
      Math.abs(curr.y - lastRect.y) <
      Math.max(
        lastRect.height * COMPARE_GEOMETRY.LINE_TOLERANCE_FACTOR,
        COMPARE_GEOMETRY.MIN_LINE_TOLERANCE
      );
    const close = curr.x <= lastRect.x + lastRect.width + lastRect.height * 2;

    if (sameLine && close) {
      prev.push(curr);
    } else {
      groups.push([curr]);
    }
  }

  return groups.map((group) => calculateBoundingRect(group));
}

function collapseWords(words: WordToken[]) {
  return words.map((word) => word.compareWord).join('');
}

function areEquivalentIgnoringWordBreaks(
  beforeWords: WordToken[],
  afterWords: WordToken[]
) {
  if (beforeWords.length === 0 || afterWords.length === 0) {
    return false;
  }

  return collapseWords(beforeWords) === collapseWords(afterWords);
}

function createWordChange(
  changes: CompareTextChange[],
  type: CompareTextChange['type'],
  beforeWords: WordToken[],
  afterWords: WordToken[]
) {
  const beforeText = beforeWords.map((w) => w.word).join(' ');
  const afterText = afterWords.map((w) => w.word).join(' ');
  if (!beforeText && !afterText) return;

  const id = `${type}-${changes.length}`;
  const beforeRects = groupAdjacentRects(beforeWords.map((w) => w.rect));
  const afterRects = groupAdjacentRects(afterWords.map((w) => w.rect));

  if (type === 'modified') {
    changes.push({
      id,
      type,
      description: `Replaced "${beforeText}" with "${afterText}"`,
      beforeText,
      afterText,
      beforeRects,
      afterRects,
    });
  } else if (type === 'removed') {
    changes.push({
      id,
      type,
      description: `Removed "${beforeText}"`,
      beforeText,
      afterText: '',
      beforeRects,
      afterRects: [],
    });
  } else {
    changes.push({
      id,
      type,
      description: `Added "${afterText}"`,
      beforeText: '',
      afterText,
      beforeRects: [],
      afterRects,
    });
  }
}

function toSummary(changes: CompareTextChange[]): CompareChangeSummary {
  return changes.reduce(
    (summary, change) => {
      if (change.type === 'added') summary.added += 1;
      if (change.type === 'removed') summary.removed += 1;
      if (change.type === 'modified') summary.modified += 1;
      return summary;
    },
    { added: 0, removed: 0, modified: 0 }
  );
}

export function diffTextRuns(
  beforeItems: CompareTextItem[],
  afterItems: CompareTextItem[]
) {
  const beforeWords = beforeItems.flatMap(splitLineIntoWords);
  const afterWords = afterItems.flatMap(splitLineIntoWords);

  const rawChanges = diffArrays(
    beforeWords.map((w) => w.compareWord),
    afterWords.map((w) => w.compareWord)
  );

  const changes: CompareTextChange[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  for (let i = 0; i < rawChanges.length; i++) {
    const change = rawChanges[i];
    const count = change.value.length;

    if (change.removed) {
      const removedTokens = beforeWords.slice(beforeIndex, beforeIndex + count);
      beforeIndex += count;

      const next = rawChanges[i + 1];
      if (next?.added) {
        const addedTokens = afterWords.slice(
          afterIndex,
          afterIndex + next.value.length
        );
        afterIndex += next.value.length;
        if (areEquivalentIgnoringWordBreaks(removedTokens, addedTokens)) {
          i++;
          continue;
        }
        createWordChange(changes, 'modified', removedTokens, addedTokens);
        i++;
      } else {
        createWordChange(changes, 'removed', removedTokens, []);
      }
      continue;
    }

    if (change.added) {
      const addedTokens = afterWords.slice(afterIndex, afterIndex + count);
      afterIndex += count;
      createWordChange(changes, 'added', [], addedTokens);
      continue;
    }

    beforeIndex += count;
    afterIndex += count;
  }

  return { changes, summary: toSummary(changes) };
}

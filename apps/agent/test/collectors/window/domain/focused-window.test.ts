import { describe, expect, it } from 'vitest';
import {
  MAX_REPLY_LENGTH,
  MAX_WINDOWS,
  MAX_WM_CLASS_LENGTH,
  parseWindowList,
} from '../../../../src/collectors/window/domain/focused-window.js';

const TERMINAL = {
  in_current_workspace: true,
  wm_class: 'gnome-terminal-server',
  wm_class_instance: 'gnome-terminal-server',
  pid: 4242,
  id: 1,
  frame_type: 0,
  window_type: 0,
  focus: false,
};
const BROWSER = { ...TERMINAL, wm_class: 'firefox', pid: 1717, id: 2, focus: true };

function reply(windows: unknown): readonly unknown[] {
  return [JSON.stringify(windows)];
}

describe('parseWindowList', () => {
  it('returns the focused window', () => {
    // Act
    const result = parseWindowList(reply([TERMINAL, BROWSER]));

    // Assert
    expect(result).toEqual({ status: 'focused', window: { wmClass: 'firefox', pid: 1717 } });
  });

  it('never carries the title, even when the extension sends one', () => {
    // Arrange
    const titled = { ...BROWSER, title: 'Bank statement - Mozilla Firefox' };

    // Act
    const result = parseWindowList(reply([titled]));

    // Assert
    expect(JSON.stringify(result)).not.toContain('Bank statement');
  });

  it('normalizes the wm_class into an app ID', () => {
    // Act
    const result = parseWindowList(reply([{ ...BROWSER, wm_class: 'Microsoft Teams' }]));

    // Assert
    expect(result).toEqual({
      status: 'focused',
      window: { wmClass: 'Microsoft-Teams', pid: 1717 },
    });
  });

  it.each([
    ['no window has focus', [TERMINAL]],
    ['the list is empty', []],
    ['the focused window has no wm_class', [{ ...BROWSER, wm_class: null }]],
    ['the wm_class has nothing usable', [{ ...BROWSER, wm_class: '   ' }]],
    ['the pid is unknown', [{ ...BROWSER, pid: -1 }]],
    ['the pid is zero', [{ ...BROWSER, pid: 0 }]],
  ])('reports no focused window when %s', (_case, windows) => {
    // Act / Assert
    expect(parseWindowList(reply(windows))).toEqual({ status: 'none' });
  });

  it.each([
    ['an empty body', []],
    ['a non-string body', [BROWSER.pid]],
    ['two values', ['[]', '[]']],
    ['invalid JSON', ['[{']],
    ['a JSON object instead of a list', [JSON.stringify(BROWSER)]],
    ['a window without focus', reply([{ ...BROWSER, focus: undefined }])],
    ['a string pid', reply([{ ...BROWSER, pid: '1717' }])],
    ['a fractional pid', reply([{ ...BROWSER, pid: 1.5 }])],
    ['a huge wm_class', reply([{ ...BROWSER, wm_class: 'x'.repeat(MAX_WM_CLASS_LENGTH + 1) }])],
    ['too many windows', reply(Array.from({ length: MAX_WINDOWS + 1 }, () => TERMINAL))],
    ['an oversized reply', [`[${' '.repeat(MAX_REPLY_LENGTH)}]`]],
  ])('rejects %s as malformed', (_case, body) => {
    // Act / Assert
    expect(parseWindowList(body)).toEqual({ status: 'malformed' });
  });
});

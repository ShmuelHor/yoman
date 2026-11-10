import { describe, expect, it } from 'vitest';
import { escapeMarkup, plainText } from '../../../../src/actuators/notifier/domain/markup.js';

describe('escapeMarkup', () => {
  it('escapes markup so a tag shows as text', () => {
    expect(escapeMarkup('<b>bold</b> & "q" \'s')).toBe(
      '&lt;b&gt;bold&lt;/b&gt; &amp; &quot;q&quot; &#39;s',
    );
  });

  it('leaves plain text and Hebrew untouched', () => {
    expect(escapeMarkup('נותרו 15%')).toBe('נותרו 15%');
  });
});

describe('plainText', () => {
  it('removes control characters such as newlines and escapes', () => {
    expect(plainText('fire\nfox\u001b[31m\u0085')).toBe('firefox[31m');
  });

  it('removes bidi overrides, isolates and marks that could disguise a name', () => {
    expect(plainText('‮exe.txt⁦a⁩‏')).toBe('exe.txta');
  });

  it('keeps ordinary text, including Hebrew', () => {
    expect(plainText('Code - עבודה')).toBe('Code - עבודה');
  });
});

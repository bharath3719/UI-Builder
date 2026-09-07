import { describe, expect, it } from 'vitest';
import { DisplayName, SLUG_PATTERN, Slug, slugify } from './common.js';
import { Email, Password } from './auth.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Acme Inc')).toBe('acme-inc');
    expect(slugify('  Spaced   Out  ')).toBe('spaced-out');
  });

  it('folds accents to their base letter rather than dropping the letter', () => {
    expect(slugify('Café')).toBe('cafe');
    expect(slugify('Über Straße')).toBe('uber-strasse');
  });

  it('collapses runs of punctuation into a single hyphen', () => {
    expect(slugify('a---b__c!!!d')).toBe('a-b-c-d');
  });

  it('returns empty when there is nothing to slug, rather than a stray hyphen', () => {
    expect(slugify('🎨')).toBe('');
    expect(slugify('...')).toBe('');
    expect(slugify('')).toBe('');
  });

  it('never emits something the pattern rejects', () => {
    const names = ['Acme Inc', 'Café Über', 'a-b--c', '  --x--  ', '99 red balloons', 'ß'];

    for (const name of names) {
      const slug = slugify(name);
      if (slug !== '') {
        expect(slug, `slug for ${JSON.stringify(name)}`).toMatch(SLUG_PATTERN);
      }
    }
  });

  it('caps length without leaving a trailing hyphen', () => {
    // 'a'x47 + ' b' would slice to 'a'x47 + '-', which is not a valid slug.
    const slug = slugify(`${'a'.repeat(47)} b`);

    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug).toMatch(SLUG_PATTERN);
  });
});

describe('Slug', () => {
  it('normalises before validating', () => {
    expect(Slug.parse('  MyApp  ')).toBe('myapp');
  });

  it('rejects shapes that would not survive a URL path', () => {
    for (const bad of ['a', '-lead', 'trail-', 'double--hyphen', 'has space', 'UPPER!', '']) {
      expect(Slug.safeParse(bad).success, `should reject ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it('rejects names that would shadow a studio route', () => {
    for (const reserved of ['new', 'settings', 'preview', 'api']) {
      expect(Slug.safeParse(reserved).success, `should reserve ${reserved}`).toBe(false);
    }
  });
});

describe('Email', () => {
  it('trims and lowercases, so one address cannot become two accounts', () => {
    expect(Email.parse('  Ada@Example.TEST ')).toBe('ada@example.test');
  });

  it('rejects what is not an address', () => {
    for (const bad of ['', 'nope', 'a@', '@b.co', 'a b@c.co']) {
      expect(Email.safeParse(bad).success, `should reject ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it('bounds the length', () => {
    expect(Email.safeParse(`${'a'.repeat(250)}@example.test`).success).toBe(false);
  });
});

describe('Password', () => {
  it('requires eight characters but does not trim them', () => {
    expect(Password.safeParse('short').success).toBe(false);
    expect(Password.parse('        ')).toBe('        ');
  });

  it('caps the length, because hashing is deliberately expensive', () => {
    expect(Password.safeParse('a'.repeat(201)).success).toBe(false);
  });
});

describe('DisplayName', () => {
  it('trims, and rejects a name that was only whitespace', () => {
    expect(DisplayName.parse('  Acme  ')).toBe('Acme');
    expect(DisplayName.safeParse('   ').success).toBe(false);
  });
});

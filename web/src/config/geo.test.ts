import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryByCode, countryName, currencySymbolFor, defaultCountry, formatCurrency, normalisePhone } from '@/config/geo';

describe('Zambia-first configuration', () => {
  it('defaults to Zambia, in first position in the list', () => {
    expect(defaultCountry.code).toBe('ZM');
    expect(defaultCountry.name).toBe('Zambia');
    expect(defaultCountry.dialCode).toBe('+260');
    expect(defaultCountry.currency).toBe('ZMW');
    expect(COUNTRIES[0]?.code).toBe('ZM');
  });

  it('accepts international numbers as typed and normalises local ones to +260', () => {
    expect(normalisePhone('0971234567', 'ZM')).toBe('+260971234567');
    expect(normalisePhone('097 123 4567', 'ZM')).toBe('+260971234567');
    expect(normalisePhone('+260971234567', 'ZM')).toBe('+260971234567');
    expect(normalisePhone('00260971234567', 'ZM')).toBe('+260971234567');
    expect(normalisePhone('260971234567', 'ZM')).toBe('+260971234567');
  });

  it('still supports other countries and international codes', () => {
    expect(normalisePhone('0821234567', 'ZA')).toBe('+27821234567');
    expect(normalisePhone('0712345678', 'KE')).toBe('+254712345678');
    expect(normalisePhone('+44 7123 456789', 'ZM')).toBe('+447123456789');
    expect(countryByCode('gb')?.name).toBe('United Kingdom');
    expect(countryName('ZW')).toBe('Zimbabwe');
    expect(countryName(undefined)).toBe('Zambia');
  });

  it('returns nothing for an empty number rather than a stray prefix', () => {
    expect(normalisePhone('', 'ZM')).toBe('');
    expect(normalisePhone('   ', 'ZM')).toBe('');
  });

  it('formats money in the country currency, Zambian Kwacha by default', () => {
    expect(formatCurrency(1500)).toContain('1,500');
    expect(currencySymbolFor('ZM')).toBe('K');
    expect(currencySymbolFor(undefined)).toBe('K');
  });
});

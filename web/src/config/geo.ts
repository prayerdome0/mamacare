/**
 * Country, dialling code and currency configuration.
 *
 * MAMA CARE is a Zambian platform: Zambia is the default everywhere a country,
 * a dialling code or a currency is needed, and it is first in every list. The
 * application stays usable internationally — every one of these values can be
 * overridden per deployment with environment variables, and users may select any
 * country during registration or in their profile.
 *
 *   VITE_DEFAULT_COUNTRY=ZM          ISO 3166-1 alpha-2
 *   VITE_DEFAULT_CURRENCY=ZMW        ISO 4217
 *   VITE_DEFAULT_DIAL_CODE=+260
 */

import { app } from '@/config/env';

export interface Country {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  name: string;
  /** International dialling prefix, e.g. `+260`. */
  dialCode: string;
  /** ISO 4217 currency code. */
  currency: string;
  currencySymbol: string;
  /** Example national number, used as a placeholder hint. */
  example: string;
  /** Region grouping for the selector (all countries are selectable). */
  region: 'Southern Africa' | 'East Africa' | 'Central Africa' | 'West Africa' | 'North Africa' | 'International';
}

/** Zambia first, then the region, then the rest of the world. */
export const COUNTRIES: Country[] = [
  { code: 'ZM', name: 'Zambia', dialCode: '+260', currency: 'ZMW', currencySymbol: 'K', example: '097 1234567', region: 'Southern Africa' },
  { code: 'ZW', name: 'Zimbabwe', dialCode: '+263', currency: 'USD', currencySymbol: '$', example: '077 123 4567', region: 'Southern Africa' },
  { code: 'MW', name: 'Malawi', dialCode: '+265', currency: 'MWK', currencySymbol: 'MK', example: '099 123 4567', region: 'Southern Africa' },
  { code: 'MZ', name: 'Mozambique', dialCode: '+258', currency: 'MZN', currencySymbol: 'MT', example: '84 123 4567', region: 'Southern Africa' },
  { code: 'BW', name: 'Botswana', dialCode: '+267', currency: 'BWP', currencySymbol: 'P', example: '71 123 456', region: 'Southern Africa' },
  { code: 'NA', name: 'Namibia', dialCode: '+264', currency: 'NAD', currencySymbol: '$', example: '081 123 4567', region: 'Southern Africa' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', currency: 'ZAR', currencySymbol: 'R', example: '082 123 4567', region: 'Southern Africa' },
  { code: 'TZ', name: 'Tanzania', dialCode: '+255', currency: 'TZS', currencySymbol: 'TSh', example: '071 234 5678', region: 'East Africa' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', currency: 'KES', currencySymbol: 'KSh', example: '071 234 5678', region: 'East Africa' },
  { code: 'UG', name: 'Uganda', dialCode: '+256', currency: 'UGX', currencySymbol: 'USh', example: '071 234 5678', region: 'East Africa' },
  { code: 'RW', name: 'Rwanda', dialCode: '+250', currency: 'RWF', currencySymbol: 'FRw', example: '078 123 4567', region: 'East Africa' },
  { code: 'ET', name: 'Ethiopia', dialCode: '+251', currency: 'ETB', currencySymbol: 'Br', example: '091 123 4567', region: 'East Africa' },
  { code: 'CD', name: 'DR Congo', dialCode: '+243', currency: 'CDF', currencySymbol: 'FC', example: '081 234 5678', region: 'Central Africa' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', currency: 'NGN', currencySymbol: '₦', example: '080 1234 5678', region: 'West Africa' },
  { code: 'GH', name: 'Ghana', dialCode: '+233', currency: 'GHS', currencySymbol: 'GH₵', example: '024 123 4567', region: 'West Africa' },
  { code: 'EG', name: 'Egypt', dialCode: '+20', currency: 'EGP', currencySymbol: 'E£', example: '010 1234 5678', region: 'North Africa' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', currency: 'GBP', currencySymbol: '£', example: '07123 456789', region: 'International' },
  { code: 'US', name: 'United States', dialCode: '+1', currency: 'USD', currencySymbol: '$', example: '(555) 123-4567', region: 'International' },
  { code: 'IN', name: 'India', dialCode: '+91', currency: 'INR', currencySymbol: '₹', example: '098765 43210', region: 'International' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', currency: 'AED', currencySymbol: 'AED', example: '050 123 4567', region: 'International' },
  { code: 'AU', name: 'Australia', dialCode: '+61', currency: 'AUD', currencySymbol: 'A$', example: '0412 345 678', region: 'International' },
  { code: 'OTHER', name: 'Other country', dialCode: '+', currency: 'USD', currencySymbol: '$', example: '001 234 5678', region: 'International' },
];

const DEFAULT_COUNTRY_CODE = (app.defaultCountry || 'ZM').trim().toUpperCase();

export const defaultCountry: Country =
  COUNTRIES.find((country) => country.code === DEFAULT_COUNTRY_CODE) ?? COUNTRIES[0]!;

export const countryByCode = (code: string | null | undefined): Country | undefined =>
  COUNTRIES.find((country) => country.code === (code ?? '').trim().toUpperCase());

export const countryName = (code: string | null | undefined): string => countryByCode(code)?.name ?? 'Zambia';

/** `K` for Zambian Kwacha; the ISO code when no symbol is known. */
export const currencySymbolFor = (countryCode: string | null | undefined): string =>
  countryByCode(countryCode)?.currencySymbol ?? 'K';

export const currencyFor = (countryCode: string | null | undefined): string =>
  countryByCode(countryCode)?.currency ?? app.defaultCurrency;

/**
 * Formats an amount for display. Amounts are stored as plain numbers; the
 * currency shown depends on the facility's or user's country, defaulting to
 * Zambian Kwacha.
 */
export function formatCurrency(amount: number, countryCode?: string | null): string {
  const country = countryByCode(countryCode);
  const currency = country?.currency ?? app.defaultCurrency;
  try {
    return new Intl.NumberFormat('en-ZM', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${country?.currencySymbol ?? 'K'}${amount.toFixed(2)}`;
  }
}

/**
 * Normalises a typed phone number to E.164 using the selected country when the
 * user did not type a country code. Zambian local numbers (`097 1234567`) become
 * `+260971234567`, which is what the SMS provider and the reminder queue expect.
 */
export function normalisePhone(input: string, countryCode?: string | null): string {
  const raw = input.replace(/[\s()\-.]/g, '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;

  const dial = countryByCode(countryCode)?.dialCode ?? defaultCountry.dialCode;
  const digits = raw.replace(/\D/g, '');
  const dialDigits = dial.replace(/\D/g, '');

  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (dialDigits && digits.startsWith(dialDigits)) return `+${digits}`;

  // A Zambian local number always starts with 0 (e.g. 097, 096, 095, 077).
  const national = digits.replace(/^0+/, '');
  return `${dial}${national}`;
}

export const countryOptions = (): { value: string; label: string }[] =>
  COUNTRIES.map((country) => ({
    value: country.code,
    label: country.code === defaultCountry.code ? `${country.name} (default)` : country.name,
  }));

import * as z from 'zod';

// Nutrition is per unit, and a unit can be a large pack (a 5 kg rice sack is
// ~18,000 kcal), so the limits only catch nonsense values.
export const PRICE_UNITS = ['kg', 'liter', 'piece', 'pack'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const PRICE_CATEGORIES = ['staple', 'protein', 'vegetable', 'fruit', 'dairy', 'pantry'] as const;
export type PriceCategory = (typeof PRICE_CATEGORIES)[number];

export interface PriceItem {
  id: string;
  name: string;
  category: PriceCategory;
  unit: PriceUnit;
  price: number; // per unit, in the list's currency
  kcalPerUnit: number;
  proteinGPerUnit: number;
}

export interface PriceList {
  country: string;
  city: string;
  currency: string; // ISO 4217
  estimatedAt: string; // ISO timestamp
  source: 'ai-estimate';
  items: PriceItem[];
}

// What Gemini returns for a price lookup; ids are assigned in code.
export const aiPriceListSchema = z.object({
  currency: z.string().describe('ISO 4217 currency code used in this city, for example "PHP", "USD", "KES".'),
  items: z
    .array(
      z.object({
        name: z
          .string()
          .describe('Common local name, with the pack size when the unit is "pack", for example "Instant noodles (55 g pack)".'),
        category: z.enum(PRICE_CATEGORIES),
        unit: z.enum(PRICE_UNITS).describe('The unit the price is for. Loose produce and meat per kg; eggs per piece.'),
        price: z.number().positive().describe('Typical current retail price for one unit, in the local currency.'),
        kcalPerUnit: z.number().min(0).max(100_000).describe('Estimated kcal in one unit.'),
        proteinGPerUnit: z.number().min(0).max(5_000).describe('Estimated grams of protein in one unit.'),
      }),
    )
    .min(20)
    .max(60),
});

export function isCurrencyCode(code: string): boolean {
  return Intl.supportedValuesOf('currency').includes(code.toUpperCase());
}

// Stable ids from names, made unique, so the plan can reference items safely.
export function assignIds<T extends { name: string }>(items: T[]): (T & { id: string })[] {
  const used = new Set<string>();
  return items.map((item) => {
    const base =
      item.name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}]+/gu, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'item';
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return { ...item, id };
  });
}

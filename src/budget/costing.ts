// Budget arithmetic. Pure functions, no I/O: the AI picks meals, but every
// cost, every total and the minimum-budget decision are calculated here.

import type { PriceItem, PriceUnit } from './prices.js';

export interface Household {
  adults: number;
  children: number;
}

// Planning averages, not individual requirements.
export const NEEDS = {
  adult: { kcalPerDay: 2000, proteinGPerDay: 50, vegetableKgPerDay: 0.3 },
  child: { kcalPerDay: 1500, proteinGPerDay: 30, vegetableKgPerDay: 0.2 },
  // Oil, salt and seasoning on top of the basic basket.
  seasoningShare: 0.1,
  // A week's shopping must supply at least this share of the household's needs.
  minimumSupplyShare: 0.9,
} as const;

export interface WeeklyNeeds {
  kcal: number;
  proteinG: number;
  vegetableKg: number;
}

export function weeklyNeeds(h: Household): WeeklyNeeds {
  const day = (k: 'kcalPerDay' | 'proteinGPerDay' | 'vegetableKgPerDay') =>
    h.adults * NEEDS.adult[k] + h.children * NEEDS.child[k];
  return { kcal: day('kcalPerDay') * 7, proteinG: day('proteinGPerDay') * 7, vegetableKg: day('vegetableKgPerDay') * 7 };
}

// Shops sell whole pieces and packs; loose goods are bought in quarter-kg/litre steps.
export function purchasableQuantity(quantity: number, unit: PriceUnit): number {
  if (quantity <= 0) return 0;
  return unit === 'piece' || unit === 'pack' ? Math.ceil(quantity - 1e-9) : Math.ceil(quantity * 4 - 1e-9) / 4;
}

export interface CostedLine {
  itemId: string;
  name: string;
  category: PriceItem['category'];
  unit: PriceUnit;
  quantity: number;
  unitPrice: number;
  cost: number;
}

export interface CostedList {
  lines: CostedLine[];
  unknownIds: string[];
  totalCost: number;
  kcal: number;
  proteinG: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function costShoppingList(prices: PriceItem[], list: { itemId: string; quantity: number }[]): CostedList {
  const byId = new Map(prices.map((p) => [p.id, p]));
  const merged = new Map<string, number>();
  const unknownIds: string[] = [];
  for (const { itemId, quantity } of list) {
    if (!byId.has(itemId)) unknownIds.push(itemId);
    else merged.set(itemId, (merged.get(itemId) ?? 0) + quantity);
  }

  const lines: CostedLine[] = [];
  let kcal = 0;
  let proteinG = 0;
  for (const [itemId, raw] of merged) {
    const item = byId.get(itemId)!;
    const quantity = purchasableQuantity(raw, item.unit);
    if (quantity === 0) continue;
    lines.push({
      itemId,
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity,
      unitPrice: item.price,
      cost: round2(quantity * item.price),
    });
    kcal += quantity * item.kcalPerUnit;
    proteinG += quantity * item.proteinGPerUnit;
  }
  return {
    lines,
    unknownIds,
    totalCost: round2(lines.reduce((s, l) => s + l.cost, 0)),
    kcal: Math.round(kcal),
    proteinG: Math.round(proteinG),
  };
}

export type MinimumBudget =
  | { ok: true; weeklyCost: number; needs: WeeklyNeeds }
  | { ok: false; missing: string[]; needs: WeeklyNeeds };

const cheapestBy = (items: PriceItem[], perWhat: (i: PriceItem) => number) =>
  items
    .filter((i) => perWhat(i) > 0)
    .reduce<PriceItem | null>((best, i) => (!best || i.price / perWhat(i) < best.price / perWhat(best) ? i : best), null);

// The cheapest bare-minimum basket that meets the household's protein,
// vegetable and calorie needs from this price list. A budget below it would
// mean going hungry, so no plan is made.
export function minimumWeeklyBudget(prices: PriceItem[], h: Household): MinimumBudget {
  const needs = weeklyNeeds(h);
  const protein = cheapestBy(prices.filter((i) => i.category === 'protein'), (i) => i.proteinGPerUnit);
  const vegetable = cheapestBy(prices.filter((i) => i.category === 'vegetable' && i.unit === 'kg'), () => 1);
  const staple = cheapestBy(prices.filter((i) => i.category === 'staple'), (i) => i.kcalPerUnit);

  const missing = [
    !protein && 'a protein food',
    !vegetable && 'a vegetable sold per kg',
    !staple && 'a staple food',
  ].filter((m): m is string => Boolean(m));
  if (!protein || !vegetable || !staple) return { ok: false, missing, needs };

  const proteinQty = needs.proteinG / protein.proteinGPerUnit;
  const vegetableQty = needs.vegetableKg;
  const kcalSoFar = proteinQty * protein.kcalPerUnit + vegetableQty * vegetable.kcalPerUnit;
  const stapleQty = Math.max(0, needs.kcal - kcalSoFar) / staple.kcalPerUnit;

  const basket = proteinQty * protein.price + vegetableQty * vegetable.price + stapleQty * staple.price;
  return { ok: true, weeklyCost: round2(basket * (1 + NEEDS.seasoningShare)), needs };
}

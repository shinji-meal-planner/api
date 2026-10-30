import { expandAllergies } from '../shared/allergens.js';
import type { BudgetPlan } from './budget-schema.js';
import { checkBudgetPlan } from './check-plan.js';
import { costShoppingList, minimumWeeklyBudget, purchasableQuantity, weeklyNeeds } from './costing.js';
import { assignIds, isCurrencyCode, type PriceItem } from './prices.js';

const prices: PriceItem[] = [
  { id: 'rice', name: 'Rice', category: 'staple', unit: 'kg', price: 50, kcalPerUnit: 3600, proteinGPerUnit: 70 },
  { id: 'bread', name: 'Bread loaf', category: 'staple', unit: 'pack', price: 60, kcalPerUnit: 1300, proteinGPerUnit: 45 },
  { id: 'egg', name: 'Egg', category: 'protein', unit: 'piece', price: 8, kcalPerUnit: 70, proteinGPerUnit: 6 },
  { id: 'mung', name: 'Mung beans', category: 'protein', unit: 'kg', price: 120, kcalPerUnit: 3470, proteinGPerUnit: 240 },
  { id: 'tilapia', name: 'Tilapia', category: 'protein', unit: 'kg', price: 140, kcalPerUnit: 960, proteinGPerUnit: 200 },
  { id: 'kangkong', name: 'Kangkong', category: 'vegetable', unit: 'kg', price: 40, kcalPerUnit: 190, proteinGPerUnit: 26 },
  { id: 'oil', name: 'Cooking oil', category: 'pantry', unit: 'liter', price: 100, kcalPerUnit: 8000, proteinGPerUnit: 0 },
];

describe('purchasableQuantity', () => {
  it('rounds pieces and packs up to whole units and loose goods up to 0.25', () => {
    expect(purchasableQuantity(10.2, 'piece')).toBe(11);
    expect(purchasableQuantity(1, 'pack')).toBe(1);
    expect(purchasableQuantity(1.1, 'kg')).toBe(1.25);
    expect(purchasableQuantity(0.5, 'liter')).toBe(0.5);
    expect(purchasableQuantity(0, 'kg')).toBe(0);
  });
});

describe('costShoppingList', () => {
  it('costs from the price list, merges duplicates and flags unknown ids', () => {
    const c = costShoppingList(prices, [
      { itemId: 'rice', quantity: 2 },
      { itemId: 'rice', quantity: 1.1 }, // merged to 3.1 → 3.25 kg
      { itemId: 'egg', quantity: 12 },
      { itemId: 'caviar', quantity: 1 },
    ]);
    expect(c.unknownIds).toEqual(['caviar']);
    expect(c.lines.find((l) => l.itemId === 'rice')).toMatchObject({ quantity: 3.25, cost: 162.5 });
    expect(c.totalCost).toBe(162.5 + 96);
    expect(c.kcal).toBe(3.25 * 3600 + 12 * 70);
  });
});

describe('minimumWeeklyBudget', () => {
  const household = { adults: 2, children: 1 };

  it('builds the cheapest basket that meets protein, vegetable and calorie needs', () => {
    const needs = weeklyNeeds(household);
    expect(needs).toEqual({ kcal: 5500 * 7, proteinG: 130 * 7, vegetableKg: 0.8 * 7 });
    const min = minimumWeeklyBudget(prices, household);
    expect(min.ok).toBe(true);
    if (!min.ok) return;
    // Mung beans are the cheapest protein per gram, rice the cheapest kcal.
    const beansKg = needs.proteinG / 240;
    const vegKg = needs.vegetableKg;
    const riceKg = (needs.kcal - beansKg * 3470 - vegKg * 190) / 3600;
    expect(min.weeklyCost).toBeCloseTo((beansKg * 120 + vegKg * 40 + riceKg * 50) * 1.1, 1);
  });

  it('says what is missing when a basic food group is absent', () => {
    const min = minimumWeeklyBudget(prices.filter((p) => p.category !== 'vegetable'), household);
    expect(min).toMatchObject({ ok: false, missing: ['a vegetable sold per kg'] });
  });
});

describe('checkBudgetPlan', () => {
  const needs = weeklyNeeds({ adults: 1, children: 0 });
  const plan = (shoppingList: BudgetPlan['shoppingList'], ingredientId = 'rice', mealName = 'Arroz caldo'): BudgetPlan => ({
    overview: 'Test.',
    tips: [],
    shoppingList,
    days: Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      meals: [
        { slot: 'lunch', name: mealName, ingredients: [{ itemId: ingredientId, amount: '200 g' }], preparation: 'Boil.' },
        { slot: 'dinner', name: 'Ginisang monggo', ingredients: [{ itemId: 'mung', amount: '150 g' }], preparation: 'Simmer.' },
      ],
    })),
  });
  const enough = [
    { itemId: 'rice', quantity: 3 },
    { itemId: 'mung', quantity: 1.5 },
  ];
  const ctx = { prices, weeklyBudget: 400, needs, allergens: [], currency: 'PHP' };

  it('passes a plan that is within budget and feeds the household', () => {
    const { problems, costed } = checkBudgetPlan(plan(enough), ctx);
    expect(problems).toEqual([]);
    expect(costed.totalCost).toBe(330);
  });

  it('rejects going over budget, by the real cost', () => {
    const { problems } = checkBudgetPlan(plan(enough), { ...ctx, weeklyBudget: 300 });
    expect(problems[0]).toContain('PHP 30.00 over');
  });

  it('rejects a cheap plan that does not supply enough food', () => {
    const { problems } = checkBudgetPlan(plan([{ itemId: 'rice', quantity: 1 }, { itemId: 'mung', quantity: 0.25 }]), ctx);
    expect(problems.join(' ')).toMatch(/kcal for the week/);
    expect(problems.join(' ')).toMatch(/g of protein/);
  });

  it('rejects unknown items, unbought ingredients and allergens', () => {
    expect(checkBudgetPlan(plan(enough, 'lobster'), ctx).problems.join(' ')).toContain('not on the price list');
    expect(checkBudgetPlan(plan(enough, 'egg'), ctx).problems.join(' ')).toContain('not on the shopping list: Egg');
    const fish = { ...ctx, allergens: expandAllergies(['fish']) };
    expect(checkBudgetPlan(plan(enough, 'rice', 'Rice with patis'), fish).problems.join(' ')).toContain('"patis"');
  });
});

describe('price limits', () => {
  it('accepts realistic per-unit nutrition for protein-dense foods and big packs', async () => {
    const { aiPriceListSchema } = await import('./prices.js');
    const item = { name: 'Omena (dried fish)', category: 'protein', unit: 'kg', price: 400, kcalPerUnit: 3000, proteinGPerUnit: 600 };
    const sack = { name: 'Rice (25 kg sack)', category: 'staple', unit: 'pack', price: 1300, kcalPerUnit: 90000, proteinGPerUnit: 1700 };
    const filler = Array.from({ length: 18 }, (_, i) => ({ ...item, name: `Item ${i}` }));
    expect(aiPriceListSchema.safeParse({ currency: 'KES', items: [item, sack, ...filler] }).success).toBe(true);
  });
});

describe('prices helpers', () => {
  it('validates ISO currency codes', () => {
    expect(isCurrencyCode('PHP')).toBe(true);
    expect(isCurrencyCode('kes')).toBe(true);
    expect(isCurrencyCode('PESO')).toBe(false);
  });

  it('assigns unique, readable ids', () => {
    expect(assignIds([{ name: 'Rice (well-milled)' }, { name: 'Rice, well milled' }, { name: '¥¥' }]).map((i) => i.id)).toEqual([
      'rice_well_milled',
      'rice_well_milled_2',
      'item',
    ]);
  });
});

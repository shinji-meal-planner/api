import { expandAllergies } from '../shared/allergens.js';
import { checkWeek } from './plan-ai.service.js';
import type { Meal, WeekPlan } from './plan-schema.js';

const meal = (name: string, calories: number, items: string[]): Meal => ({
  slot: 'lunch',
  name,
  ingredients: items.map((item) => ({ item, amount: '100 g' })),
  preparation: 'Cook and serve.',
  calories,
  proteinG: 20,
  carbsG: 40,
  fatG: 10,
});

const week = (meals: Meal[]): WeekPlan => ({
  overview: 'A test week.',
  days: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, meals })),
});

const ok = [meal('Chicken tinola', 600, ['chicken', 'green papaya', 'ginger']), meal('Rice', 600, ['rice']), meal('Fruit', 600, ['banana'])];

describe('checkWeek', () => {
  it('passes a plan on target with no allergens', () => {
    expect(checkWeek(week(ok), { dailyCalories: 1800, allergens: expandAllergies(['fish']) })).toEqual([]);
  });

  it('rejects days outside the calorie tolerance, using its own totals', () => {
    const problems = checkWeek(week(ok), { dailyCalories: 2200, allergens: [] });
    expect(problems).toHaveLength(7);
    expect(problems[0]).toContain('1800 kcal');
  });

  it('rejects a hidden allergen in an ingredient', () => {
    const withPatis = [...ok.slice(0, 2), meal('Pinakbet', 600, ['squash', 'patis'])];
    const problems = checkWeek(week(withPatis), { dailyCalories: 1800, allergens: expandAllergies(['fish']) });
    expect(problems).toHaveLength(7);
    expect(problems[0]).toContain('"patis"');
  });

  it('rejects missing or duplicated days', () => {
    const plan = week(ok);
    plan.days[6].day = 1;
    expect(checkWeek(plan, { dailyCalories: 1800, allergens: [] })[0]).toContain('numbered 1 to 7');
  });
});

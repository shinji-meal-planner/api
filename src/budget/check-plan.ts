import { findAllergens, type AllergenRule } from '../shared/allergens.js';
import type { BudgetPlan } from './budget-schema.js';
import { costShoppingList, NEEDS, type CostedList, type WeeklyNeeds } from './costing.js';
import type { PriceItem } from './prices.js';

export interface PlanCheckContext {
  prices: PriceItem[];
  weeklyBudget: number;
  needs: WeeklyNeeds;
  allergens: AllergenRule[];
  currency: string;
}

// Code-side checks on a generated plan: real costs from the price list,
// enough food for the household, valid items, and no allergens.
export function checkBudgetPlan(plan: BudgetPlan, ctx: PlanCheckContext): { problems: string[]; costed: CostedList } {
  const problems: string[] = [];
  const costed = costShoppingList(ctx.prices, plan.shoppingList);
  const byId = new Map(ctx.prices.map((p) => [p.id, p]));
  const money = (n: number) => `${ctx.currency} ${n.toFixed(2)}`;

  const dayNumbers = plan.days.map((d) => d.day).sort((a, b) => a - b);
  if (dayNumbers.join() !== '1,2,3,4,5,6,7') problems.push('Days must be numbered 1 to 7, once each.');

  if (costed.unknownIds.length) {
    problems.push(`The shopping list uses ids that are not on the price list: ${costed.unknownIds.join(', ')}.`);
  }
  if (costed.totalCost > ctx.weeklyBudget) {
    problems.push(
      `The shopping list costs ${money(costed.totalCost)}, which is ${money(costed.totalCost - ctx.weeklyBudget)} over the ${money(ctx.weeklyBudget)} budget. Buy less of the expensive items or swap them for cheaper ones.`,
    );
  }
  const minKcal = ctx.needs.kcal * NEEDS.minimumSupplyShare;
  if (costed.kcal < minKcal) {
    problems.push(`The shopping list supplies ${costed.kcal} kcal for the week; the household needs at least ${Math.round(minKcal)}. Buy more of the cheap staples.`);
  }
  const minProtein = ctx.needs.proteinG * NEEDS.minimumSupplyShare;
  if (costed.proteinG < minProtein) {
    problems.push(`The shopping list supplies ${costed.proteinG} g of protein; the household needs at least ${Math.round(minProtein)} g. Add cheap protein such as eggs or beans.`);
  }

  const bought = new Set(plan.shoppingList.map((s) => s.itemId));
  const missingFromList = new Set<string>();
  for (const day of plan.days) {
    for (const meal of day.meals) {
      const names: string[] = [];
      for (const ing of meal.ingredients) {
        const item = byId.get(ing.itemId);
        if (!item) problems.push(`Day ${day.day} "${meal.name}" uses "${ing.itemId}", which is not on the price list.`);
        else {
          names.push(item.name);
          if (!bought.has(ing.itemId)) missingFromList.add(item.name);
        }
      }
      const text = [meal.name, meal.preparation, ...names].join(' \n ');
      for (const hit of findAllergens(text, ctx.allergens)) {
        problems.push(`Day ${day.day} "${meal.name}" contains "${hit.term}", which the household is allergic to (${hit.allergy}).`);
      }
    }
  }
  if (missingFromList.size) {
    problems.push(`These ingredients are used in meals but not on the shopping list: ${[...missingFromList].join(', ')}.`);
  }

  return { problems, costed };
}

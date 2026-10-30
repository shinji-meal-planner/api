import { BadRequestException, Injectable } from '@nestjs/common';
import { expandAllergies, findAllergens, parseAllergyList } from '../shared/allergens.js';
import { BudgetAiService } from './budget-ai.service.js';
import type { BudgetPlan } from './budget-schema.js';
import { minimumWeeklyBudget, type CostedLine, type WeeklyNeeds } from './costing.js';
import type { BudgetPlanDto } from './dto/budget.dto.js';
import { isCurrencyCode, type PriceItem, type PriceList } from './prices.js';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type BudgetResponse =
  | {
      status: 'refused';
      currency: string;
      weeklyBudget: number;
      minimumBudget: number | null;
      reason: string;
    }
  | {
      status: 'ok';
      currency: string;
      weeklyBudget: number;
      minimumBudget: number;
      totalCost: number;
      perPersonPerDay: number;
      needs: WeeklyNeeds;
      supplied: { kcal: number; proteinG: number };
      excludedForAllergies: string[];
      shoppingList: CostedLine[];
      overview: string;
      tips: string[];
      days: { day: number; meals: (BudgetPlan['days'][number]['meals'][number] & { ingredientNames: string[] })[] }[];
    };

@Injectable()
export class BudgetService {
  // Price estimates per place, kept for a week to save the daily AI quota.
  private readonly priceCache = new Map<string, PriceList>();

  constructor(private readonly ai: BudgetAiService) {}

  async prices(country: string, city: string): Promise<PriceList> {
    const key = `${country.trim().toLowerCase()}|${city.trim().toLowerCase()}`;
    const cached = this.priceCache.get(key);
    if (cached && Date.now() - Date.parse(cached.estimatedAt) < CACHE_TTL_MS) return cached;

    const { currency, items } = await this.ai.estimatePrices(country.trim(), city.trim());
    const list: PriceList = {
      country: country.trim(),
      city: city.trim(),
      currency,
      estimatedAt: new Date().toISOString(),
      source: 'ai-estimate',
      items,
    };
    this.priceCache.set(key, list);
    return list;
  }

  async plan(dto: BudgetPlanDto): Promise<BudgetResponse> {
    if (!isCurrencyCode(dto.currency)) throw new BadRequestException(`${dto.currency} is not a currency code.`);
    if (new Set(dto.prices.map((p) => p.id)).size !== dto.prices.length) {
      throw new BadRequestException('Each price list item needs a unique id.');
    }

    const household = { adults: dto.adults, children: dto.children };
    const people = dto.adults + dto.children;
    const allergens = expandAllergies(parseAllergyList(dto.allergies ?? ''));

    // Allergen foods are removed before costing or planning, so neither the
    // minimum budget nor the AI can rely on them.
    const excluded: string[] = [];
    const prices: PriceItem[] = dto.prices.filter((p) => {
      const hit = findAllergens(p.name, allergens).length > 0;
      if (hit) excluded.push(p.name);
      return !hit;
    });

    const base = { currency: dto.currency, weeklyBudget: dto.weeklyBudget };
    const minimum = minimumWeeklyBudget(prices, household);
    if (!minimum.ok) {
      return {
        status: 'refused',
        ...base,
        minimumBudget: null,
        reason: `The price list needs ${minimum.missing.join(', ')} (after removing allergy foods) to check that a plan can feed the household. Add them to the list and try again.`,
      };
    }
    if (dto.weeklyBudget < minimum.weeklyCost) {
      return {
        status: 'refused',
        ...base,
        minimumBudget: minimum.weeklyCost,
        reason: `A budget of ${dto.currency} ${dto.weeklyBudget.toFixed(2)} can't feed ${people} ${people === 1 ? 'person' : 'people'} enough for a week at these prices. Even the cheapest basic basket of staples, protein and vegetables that meets everyone's calorie and protein needs costs about ${dto.currency} ${minimum.weeklyCost.toFixed(2)}. Planning below that would mean going hungry, so no plan was made. If money for food is this tight, local food banks or government food assistance programmes may be able to help.`,
      };
    }

    const { plan, costed } = await this.ai.generatePlan({
      country: dto.country,
      city: dto.city,
      currency: dto.currency,
      prices,
      weeklyBudget: dto.weeklyBudget,
      household,
      needs: minimum.needs,
      mealsPerDay: dto.mealsPerDay,
      allergens,
    });

    const byId = new Map(prices.map((p) => [p.id, p.name]));
    const categoryOrder = ['staple', 'protein', 'vegetable', 'fruit', 'dairy', 'pantry'];
    return {
      status: 'ok',
      ...base,
      minimumBudget: minimum.weeklyCost,
      totalCost: costed.totalCost,
      perPersonPerDay: Math.round((costed.totalCost / people / 7) * 100) / 100,
      needs: minimum.needs,
      supplied: { kcal: costed.kcal, proteinG: costed.proteinG },
      excludedForAllergies: excluded,
      shoppingList: [...costed.lines].sort(
        (a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || b.cost - a.cost,
      ),
      overview: plan.overview,
      tips: plan.tips,
      days: [...plan.days]
        .sort((a, b) => a.day - b.day)
        .map((d) => ({
          day: d.day,
          meals: d.meals.map((m) => ({ ...m, ingredientNames: m.ingredients.map((i) => byId.get(i.itemId) ?? i.itemId) })),
        })),
    };
  }
}

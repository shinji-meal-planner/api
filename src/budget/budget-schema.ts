import * as z from 'zod';
import { toGeminiSchema } from '../shared/gemini.client.js';

export const BUDGET_MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

export const budgetPlanSchema = z.object({
  overview: z.string().describe('Two or three sentences for the household: how this week keeps costs down.'),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(7),
        meals: z
          .array(
            z.object({
              slot: z.enum(BUDGET_MEAL_SLOTS),
              name: z.string().describe('The dish as people in this country call it, with a short English description if local.'),
              ingredients: z
                .array(
                  z.object({
                    itemId: z.string().describe('The id of an item from the price list. Salt, pepper and water are free and not listed.'),
                    amount: z.string().describe('Amount for the whole household for this meal, for example "500 g" or "6 pieces".'),
                  }),
                )
                .min(1),
              preparation: z.string().describe('How to cook it in one or two short sentences.'),
            }),
          )
          .min(2)
          .max(4),
      }),
    )
    .length(7),
  shoppingList: z
    .array(
      z.object({
        itemId: z.string(),
        quantity: z.number().positive().describe("How much to buy for the week, in that item's price unit (kg, liter, piece or pack)."),
      }),
    )
    .min(1),
  tips: z
    .array(z.string())
    .max(5)
    .describe('Short money-saving tips for this week, such as reusing leftovers.'),
});

export type BudgetPlan = z.infer<typeof budgetPlanSchema>;

export const budgetPlanJsonSchema = toGeminiSchema(budgetPlanSchema);

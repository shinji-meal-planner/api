import * as z from 'zod';
import { toGeminiSchema } from '../shared/gemini.client.js';

export const MEAL_SLOTS = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'evening_snack'] as const;

const mealSchema = z.object({
  slot: z.enum(MEAL_SLOTS),
  name: z.string().describe('The dish name as people in the country call it, with an English description if it is a local name.'),
  ingredients: z
    .array(
      z.object({
        item: z.string().describe('One ingredient, including any sauce, oil or seasoning.'),
        amount: z.string().describe('Metric amount, for example "120 g" or "1 cup cooked".'),
      }),
    )
    .describe('Every ingredient, including oils, sauces and condiments.'),
  preparation: z.string().describe('How to make it in one or two short sentences.'),
  calories: z.number().int().min(0).max(3000).describe('Estimated kcal for the portion listed.'),
  proteinG: z.number().int().min(0).max(300),
  carbsG: z.number().int().min(0).max(500),
  fatG: z.number().int().min(0).max(300),
});

export const weekPlanSchema = z.object({
  overview: z
    .string()
    .describe('Two or three sentences for the user about this week: the approach and one practical tip.'),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(7),
        meals: z.array(mealSchema).min(3).max(6),
      }),
    )
    .length(7),
});

export type WeekPlan = z.infer<typeof weekPlanSchema>;
export type Meal = WeekPlan['days'][number]['meals'][number];

export const weekPlanJsonSchema = toGeminiSchema(weekPlanSchema);

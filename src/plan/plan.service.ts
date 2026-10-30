import { BadRequestException, Injectable } from '@nestjs/common';
import { expandAllergies, parseAllergyList } from '../shared/allergens.js';
import type { PlanRequestDto } from './dto/plan-request.dto.js';
import { addDays, assess, type Assessment } from './feasibility.js';
import { PlanAiService } from './plan-ai.service.js';
import type { Meal } from './plan-schema.js';

export interface PlannedDay {
  day: number;
  date: string;
  totalCalories: number;
  meals: Meal[];
}

export type PlanResponse =
  | { status: 'refused'; assessment: Assessment; explanation: string | null }
  | {
      status: 'ok';
      assessment: Assessment;
      allergies: string[];
      week: { number: number; startDate: string; dailyCalories: number; overview: string; days: PlannedDay[] };
    };

const todayIso = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class PlanService {
  constructor(private readonly ai: PlanAiService) {}

  async plan(dto: PlanRequestDto): Promise<PlanResponse> {
    if (dto.healthConditions.length === 0 && !dto.confirmNoHealthConditions) {
      throw new BadRequestException('Confirm that none of the listed health conditions apply to you.');
    }

    const today = todayIso();
    const assessment = assess(dto, today);
    if (!assessment.feasible) {
      return { status: 'refused', assessment, explanation: await this.ai.explainRefusal(assessment, dto.country) };
    }

    const weekNumber = dto.week ?? 1;
    const target = assessment.weeks[weekNumber - 1];
    if (!target) {
      throw new BadRequestException(`This plan has ${assessment.weeks.length} weeks.`);
    }

    const allergies = parseAllergyList(dto.allergies ?? '');
    const plan = await this.ai.generateWeek({
      country: dto.country,
      sex: dto.sex,
      age: dto.age,
      week: weekNumber,
      dailyCalories: target.dailyCalories,
      goal: assessment.goal,
      allergens: expandAllergies(allergies),
    });

    const startDate = addDays(today, (weekNumber - 1) * 7);
    const days = [...plan.days]
      .sort((a, b) => a.day - b.day)
      .map((d) => ({
        day: d.day,
        date: addDays(startDate, d.day - 1),
        totalCalories: d.meals.reduce((sum, m) => sum + m.calories, 0),
        meals: d.meals,
      }));

    return {
      status: 'ok',
      assessment,
      allergies,
      week: { number: weekNumber, startDate, dailyCalories: target.dailyCalories, overview: plan.overview, days },
    };
  }
}

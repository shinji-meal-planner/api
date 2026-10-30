// Safety rules for a weight goal. Pure functions, no I/O: the AI never decides
// whether a goal is safe, it only explains and plans around what these return.

export const SEXES = ['female', 'male'] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const;
export type Activity = keyof typeof ACTIVITY_FACTORS;
export const ACTIVITIES = Object.keys(ACTIVITY_FACTORS) as Activity[];

export const HEALTH_CONDITIONS = {
  cancer: 'Cancer, or currently in cancer treatment',
  diabetes: 'Diabetes treated with medication or insulin',
  heart: 'Heart disease, or high blood pressure on medication',
  kidney: 'Kidney disease',
  liver: 'Liver disease',
  eating_disorder: 'A current or past eating disorder',
  pregnancy: 'Pregnant or breastfeeding',
  surgery: 'Major surgery in the last 3 months, or one planned',
  other: 'Another condition where a doctor manages my diet',
} as const;
export type HealthCondition = keyof typeof HEALTH_CONDITIONS;
export const HEALTH_CONDITION_IDS = Object.keys(HEALTH_CONDITIONS) as HealthCondition[];

export const RULES = {
  kcalPerKg: 7700,
  maxLossFractionPerWeek: 0.01, // 1% of body weight
  maxLossKgPerWeek: 1,
  maxGainKgPerWeek: 0.5,
  calorieFloor: { female: 1200, male: 1500 } satisfies Record<Sex, number>,
  minTargetBmi: 18.5,
  maxGainTargetBmi: 30,
  minAge: 18,
  minDays: 7,
  maxDays: 730,
} as const;

export interface PlanInput {
  currentWeightKg: number;
  targetWeightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activity: Activity;
  targetDate: string; // YYYY-MM-DD
  healthConditions: HealthCondition[];
}

export type RefusalCode =
  | 'minor'
  | 'health_condition'
  | 'date_too_soon'
  | 'date_too_far'
  | 'underweight_target'
  | 'obese_target'
  | 'loss_too_fast'
  | 'gain_too_fast'
  | 'below_calorie_floor';

export interface Refusal {
  code: RefusalCode;
  message: string;
}

export interface WeekTarget {
  week: number;
  startWeightKg: number;
  dailyCalories: number;
}

export interface Assessment {
  feasible: boolean;
  refusals: Refusal[];
  goal: 'lose' | 'gain' | 'maintain';
  days: number;
  changeKg: number;
  weeklyChangeKg: number;
  maxSafeWeeklyChangeKg: number;
  currentBmi: number;
  targetBmi: number;
  bmr: number;
  maintenanceCalories: number;
  calorieFloor: number;
  weeks: WeekTarget[];
  // Earliest date that passes every rate rule, when only the pace was the problem.
  earliestSafeDate: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

// Mifflin-St Jeor resting energy, kcal/day.
export function bmr(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Weekly calorie targets for a straight-line path from current to target weight.
// Maintenance is recalculated each week because a lighter body burns less.
function weeklyTargets(input: PlanInput, days: number): WeekTarget[] {
  const change = input.targetWeightKg - input.currentWeightKg;
  const perDay = change / days;
  const dailyAdjustment = (change * RULES.kcalPerKg) / days;
  const factor = ACTIVITY_FACTORS[input.activity];
  const weekCount = Math.ceil(days / 7);

  return Array.from({ length: weekCount }, (_, i) => {
    const startWeightKg = input.currentWeightKg + perDay * i * 7;
    const maintenance = bmr(startWeightKg, input.heightCm, input.age, input.sex) * factor;
    return {
      week: i + 1,
      startWeightKg: round1(startWeightKg),
      dailyCalories: Math.round(maintenance + dailyAdjustment),
    };
  });
}

function rateRefusals(input: PlanInput, days: number): Refusal[] {
  const change = input.targetWeightKg - input.currentWeightKg;
  const weekly = (change / days) * 7;
  const refusals: Refusal[] = [];

  if (change < 0) {
    const maxLoss = Math.min(RULES.maxLossFractionPerWeek * input.currentWeightKg, RULES.maxLossKgPerWeek);
    if (-weekly > maxLoss + 1e-9) {
      refusals.push({
        code: 'loss_too_fast',
        message: `This needs a loss of ${round1(-weekly)} kg per week. The safe maximum for you is ${round1(maxLoss)} kg per week.`,
      });
    }
    const floor = RULES.calorieFloor[input.sex];
    const lowest = Math.min(...weeklyTargets(input, days).map((w) => w.dailyCalories));
    if (lowest < floor) {
      refusals.push({
        code: 'below_calorie_floor',
        message:
          lowest <= 0
            ? `This needs a bigger calorie deficit than your body burns in a whole day, which no diet can safely do. The minimum safe intake is ${floor} kcal a day.`
            : `This needs eating as little as ${lowest} kcal a day. Going below ${floor} kcal a day without medical supervision is unsafe.`,
      });
    }
  } else if (change > 0 && weekly > RULES.maxGainKgPerWeek + 1e-9) {
    refusals.push({
      code: 'gain_too_fast',
      message: `This needs a gain of ${round1(weekly)} kg per week. Healthy weight gain is at most ${RULES.maxGainKgPerWeek} kg per week.`,
    });
  }
  return refusals;
}

function earliestSafeDays(input: PlanInput, fromDays: number): number | null {
  for (let d = Math.max(fromDays, RULES.minDays); d <= RULES.maxDays; d++) {
    if (rateRefusals(input, d).length === 0) return d;
  }
  return null;
}

export function assess(input: PlanInput, todayIso: string): Assessment {
  const days = daysBetween(todayIso, input.targetDate);
  const changeKg = input.targetWeightKg - input.currentWeightKg;
  const goal = Math.abs(changeKg) < 0.05 ? 'maintain' : changeKg < 0 ? 'lose' : 'gain';
  const targetBmi = bmi(input.targetWeightKg, input.heightCm);
  const restingBmr = bmr(input.currentWeightKg, input.heightCm, input.age, input.sex);
  const refusals: Refusal[] = [];

  if (input.age < RULES.minAge) {
    refusals.push({
      code: 'minor',
      message: 'Diet plans for people under 18 should come from a doctor or dietitian, because growing bodies have different needs.',
    });
  }
  if (input.healthConditions.length > 0) {
    const names = input.healthConditions.map((c) => HEALTH_CONDITIONS[c]).join('; ');
    refusals.push({
      code: 'health_condition',
      message: `You reported: ${names}. A weight plan with this needs to be made with your doctor.`,
    });
  }
  if (days < RULES.minDays) {
    refusals.push({ code: 'date_too_soon', message: 'The target date must be at least 7 days from today.' });
  } else if (days > RULES.maxDays) {
    refusals.push({ code: 'date_too_far', message: 'Choose a target date within 2 years.' });
  }
  if (goal !== 'gain' && targetBmi < RULES.minTargetBmi) {
    refusals.push({
      code: 'underweight_target',
      message: `A target of ${input.targetWeightKg} kg gives a BMI of ${round1(targetBmi)}, which is underweight (below ${RULES.minTargetBmi}).`,
    });
  }
  if (goal === 'gain' && targetBmi >= RULES.maxGainTargetBmi) {
    refusals.push({
      code: 'obese_target',
      message: `A target of ${input.targetWeightKg} kg gives a BMI of ${round1(targetBmi)}, which is in the obese range (${RULES.maxGainTargetBmi} or more).`,
    });
  }

  const validDays = days >= RULES.minDays && days <= RULES.maxDays;
  const paceRefusals = validDays && goal !== 'maintain' ? rateRefusals(input, days) : [];
  refusals.push(...paceRefusals);

  // Only offer a later date when the pace was the sole problem.
  const onlyPace = refusals.length > 0 && refusals.every((r) => paceRefusals.includes(r));
  const safeDays = onlyPace ? earliestSafeDays(input, days + 1) : null;

  const effectiveDays = validDays ? days : Math.min(Math.max(days, RULES.minDays), RULES.maxDays);
  const weekly = (changeKg / effectiveDays) * 7;

  return {
    feasible: refusals.length === 0,
    refusals,
    goal,
    days,
    changeKg: round1(changeKg),
    weeklyChangeKg: round1(weekly),
    maxSafeWeeklyChangeKg:
      goal === 'gain'
        ? RULES.maxGainKgPerWeek
        : round1(Math.min(RULES.maxLossFractionPerWeek * input.currentWeightKg, RULES.maxLossKgPerWeek)),
    currentBmi: round1(bmi(input.currentWeightKg, input.heightCm)),
    targetBmi: round1(targetBmi),
    bmr: Math.round(restingBmr),
    maintenanceCalories: Math.round(restingBmr * ACTIVITY_FACTORS[input.activity]),
    calorieFloor: RULES.calorieFloor[input.sex],
    weeks: refusals.length === 0 ? weeklyTargets(input, days) : [],
    earliestSafeDate: safeDays === null ? null : addDays(todayIso, safeDays),
  };
}

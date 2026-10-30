import { addDays, assess, bmr, type PlanInput } from './feasibility.js';

const TODAY = '2026-10-01';

const base: PlanInput = {
  currentWeightKg: 80,
  targetWeightKg: 75,
  heightCm: 170,
  age: 35,
  sex: 'male',
  activity: 'moderate',
  targetDate: addDays(TODAY, 70), // 10 weeks
  healthConditions: [],
};

const codes = (input: Partial<PlanInput>) => assess({ ...base, ...input }, TODAY).refusals.map((r) => r.code);

describe('bmr', () => {
  it('matches Mifflin-St Jeor', () => {
    expect(bmr(80, 170, 35, 'male')).toBeCloseTo(1692.5);
    expect(bmr(60, 160, 30, 'female')).toBeCloseTo(1289);
  });
});

describe('assess', () => {
  it('accepts a safe loss and builds weekly targets', () => {
    const a = assess(base, TODAY);
    expect(a.feasible).toBe(true);
    expect(a.goal).toBe('lose');
    expect(a.weeklyChangeKg).toBe(-0.5);
    expect(a.weeks).toHaveLength(10);
    expect(a.weeks[0].dailyCalories).toBeGreaterThan(a.weeks[9].dailyCalories);
    expect(Math.min(...a.weeks.map((w) => w.dailyCalories))).toBeGreaterThanOrEqual(1500);
  });

  it('refuses losing too fast and suggests the earliest safe date', () => {
    const a = assess({ ...base, targetWeightKg: 70, targetDate: addDays(TODAY, 28) }, TODAY);
    expect(a.feasible).toBe(false);
    expect(a.refusals.map((r) => r.code)).toContain('loss_too_fast');
    expect(a.earliestSafeDate).not.toBeNull();
    const later = assess({ ...base, targetWeightKg: 70, targetDate: a.earliestSafeDate! }, TODAY);
    expect(later.feasible).toBe(true);
    const dayBefore = assess({ ...base, targetWeightKg: 70, targetDate: addDays(a.earliestSafeDate!, -1) }, TODAY);
    expect(dayBefore.feasible).toBe(false);
  });

  it('refuses a plan that needs eating below the calorie floor', () => {
    const small: Partial<PlanInput> = {
      currentWeightKg: 55,
      targetWeightKg: 52,
      heightCm: 152,
      age: 60,
      sex: 'female',
      activity: 'sedentary',
      targetDate: addDays(TODAY, 42),
    };
    expect(codes(small)).toContain('below_calorie_floor');
  });

  it('never shows a negative calorie figure', () => {
    const a = assess({ ...base, targetWeightKg: 60, targetDate: addDays(TODAY, 30) }, TODAY);
    const floor = a.refusals.find((r) => r.code === 'below_calorie_floor')!;
    expect(floor.message).not.toMatch(/-\d/);
    expect(floor.message).toContain('bigger calorie deficit');
  });

  it('refuses an underweight target with no safe date', () => {
    const a = assess({ ...base, targetWeightKg: 50, targetDate: addDays(TODAY, 700) }, TODAY);
    expect(a.refusals.map((r) => r.code)).toContain('underweight_target');
    expect(a.earliestSafeDate).toBeNull();
  });

  it('refuses under-18s', () => {
    expect(codes({ age: 16 })).toContain('minor');
  });

  it('refuses when any health condition is reported', () => {
    const a = assess({ ...base, healthConditions: ['cancer'] }, TODAY);
    expect(a.feasible).toBe(false);
    expect(a.refusals[0].code).toBe('health_condition');
    expect(a.refusals[0].message).toContain('cancer');
    expect(a.earliestSafeDate).toBeNull();
  });

  it('refuses gaining too fast and gaining into the obese range', () => {
    expect(codes({ targetWeightKg: 90, targetDate: addDays(TODAY, 28) })).toContain('gain_too_fast');
    expect(codes({ targetWeightKg: 95, targetDate: addDays(TODAY, 700) })).toContain('obese_target');
  });

  it('refuses dates that are too soon or too far', () => {
    expect(codes({ targetDate: addDays(TODAY, 3) })).toContain('date_too_soon');
    expect(codes({ targetDate: addDays(TODAY, 800) })).toContain('date_too_far');
  });

  it('accepts maintaining weight at maintenance calories', () => {
    const a = assess({ ...base, targetWeightKg: 80 }, TODAY);
    expect(a.feasible).toBe(true);
    expect(a.goal).toBe('maintain');
    expect(a.weeks[0].dailyCalories).toBe(a.maintenanceCalories);
  });
});

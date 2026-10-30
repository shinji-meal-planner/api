import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ACTIVITIES,
  HEALTH_CONDITION_IDS,
  SEXES,
  type Activity,
  type HealthCondition,
  type Sex,
} from '../feasibility.js';

export class PlanRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(25)
  @Max(400)
  currentWeightKg: number;

  @Type(() => Number)
  @IsNumber()
  @Min(25)
  @Max(400)
  targetWeightKg: number;

  @Type(() => Number)
  @IsNumber()
  @Min(100)
  @Max(250)
  heightCm: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  age: number;

  @IsIn(SEXES)
  sex: Sex;

  @IsIn(ACTIVITIES)
  activity: Activity;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'targetDate must be YYYY-MM-DD' })
  targetDate: string;

  // Letters, spaces and a little punctuation only: these values reach the AI prompt.
  @IsString()
  @Length(2, 56)
  @Matches(/^[\p{L}][\p{L} .'()-]*$/u, { message: 'country may only contain letters, spaces and . \' ( ) -' })
  country: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^[\p{L} ,'-]*$/u, { message: 'allergies may only contain letters, spaces, commas, apostrophes and hyphens' })
  allergies?: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(HEALTH_CONDITION_IDS, { each: true })
  healthConditions: HealthCondition[];

  // Must be true when no condition is ticked: the user has to say so, not skip it.
  @IsBoolean()
  confirmNoHealthConditions: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(105)
  week?: number;
}

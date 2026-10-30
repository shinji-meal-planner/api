import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { PRICE_CATEGORIES, PRICE_UNITS, type PriceCategory, type PriceUnit } from '../prices.js';

// Letters, spaces and a little punctuation only: these values reach the AI prompt.
const PLACE = /^[\p{L}][\p{L} .'()-]*$/u;
const PLACE_MSG = 'may only contain letters, spaces and . \' ( ) -';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

export class LocationDto {
  @Transform(trim)
  @IsString()
  @Length(2, 56)
  @Matches(PLACE, { message: `country ${PLACE_MSG}` })
  country: string;

  @Transform(trim)
  @IsString()
  @Length(2, 80)
  @Matches(PLACE, { message: `city ${PLACE_MSG}` })
  city: string;
}

export class PriceItemDto {
  @IsString()
  @Matches(/^[\p{Ll}\p{N}_]{1,48}$/u)
  id: string;

  @IsString()
  @Length(1, 80)
  @Matches(/^[\p{L}\p{N} .,'()%/&+-]+$/u, { message: 'item names may only contain letters, numbers and basic punctuation' })
  name: string;

  @IsIn(PRICE_CATEGORIES)
  category: PriceCategory;

  @IsIn(PRICE_UNITS)
  unit: PriceUnit;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  price: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  kcalPerUnit: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5_000)
  proteinGPerUnit: number;
}

export class BudgetPlanDto extends LocationDto {
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency: string;

  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => PriceItemDto)
  prices: PriceItemDto[];

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100_000_000)
  weeklyBudget: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  adults: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(12)
  children: number;

  @Type(() => Number)
  @IsIn([2, 3, 4])
  mealsPerDay: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^[\p{L} ,'-]*$/u, { message: 'allergies may only contain letters, spaces, commas, apostrophes and hyphens' })
  allergies?: string;
}

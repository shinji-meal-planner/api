import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BudgetService } from './budget.service.js';
import { BudgetPlanDto, LocationDto } from './dto/budget.dto.js';

@Controller('budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  // Each call can use the free Gemini quota, so these routes are limited more tightly.
  @Post('prices')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  prices(@Body() dto: LocationDto) {
    return this.budgetService.prices(dto.country, dto.city);
  }

  @Post('plan')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  plan(@Body() dto: BudgetPlanDto) {
    return this.budgetService.plan(dto);
  }
}

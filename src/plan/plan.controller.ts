import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PlanRequestDto } from './dto/plan-request.dto.js';
import { ACTIVITY_FACTORS, HEALTH_CONDITIONS } from './feasibility.js';
import { PlanService } from './plan.service.js';

@Controller('plan')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  // The form's option lists, so the web app and the rules never drift apart.
  @Get('options')
  options() {
    return {
      activities: Object.keys(ACTIVITY_FACTORS),
      healthConditions: Object.entries(HEALTH_CONDITIONS).map(([id, label]) => ({ id, label })),
    };
  }

  // Each call can use the free Gemini quota, so this route is limited more tightly.
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  plan(@Body() dto: PlanRequestDto) {
    return this.planService.plan(dto);
  }
}

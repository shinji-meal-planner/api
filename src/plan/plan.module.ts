import { Module } from '@nestjs/common';
import { PlanAiService } from './plan-ai.service.js';
import { PlanController } from './plan.controller.js';
import { PlanService } from './plan.service.js';

@Module({
  controllers: [PlanController],
  providers: [PlanService, PlanAiService],
})
export class PlanModule {}

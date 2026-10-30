import { Module } from '@nestjs/common';
import { BudgetAiService } from './budget-ai.service.js';
import { BudgetController } from './budget.controller.js';
import { BudgetService } from './budget.service.js';

@Module({
  controllers: [BudgetController],
  providers: [BudgetService, BudgetAiService],
})
export class BudgetModule {}

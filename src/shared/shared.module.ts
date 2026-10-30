import { Global, Module } from '@nestjs/common';
import { GeminiClient } from './gemini.client.js';

@Global()
@Module({
  providers: [GeminiClient],
  exports: [GeminiClient],
})
export class SharedModule {}

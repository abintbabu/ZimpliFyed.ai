import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

const globalForAnthropic = globalThis as unknown as { anthropic?: Anthropic };

export const anthropic = globalForAnthropic.anthropic ?? new Anthropic();

if (process.env.NODE_ENV !== 'production') globalForAnthropic.anthropic = anthropic;

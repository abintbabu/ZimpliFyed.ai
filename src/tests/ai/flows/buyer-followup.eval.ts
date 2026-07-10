import { draftBuyerFollowup } from '@/lib/ai/buyer-followup';
import { runJudgedEval, type JudgedCase } from '../harness';
import type { BuyerFollowup } from '@/lib/ai/buyer-followup';

const cases: JudgedCase<string>[] = [
  {
    name: 'buyer with an open quote and no recent activity',
    input: `Buyer: Meridian Home Textiles (Germany)\nPayment terms: 30% advance, balance on BL · Currency: EUR\nRecent quotes: Q-0142 (sent, EUR 18,400.00)\nNo orders yet.\nNo prior activity logged.`,
    rubric: 'The draft should nudge the buyer about the open quote Q-0142 without inventing a price, deadline, or prior conversation that was not in the context. It should read as a natural, professional follow-up, not a generic template with placeholder-style filler.',
  },
  {
    name: 'buyer with unclear next step',
    input: `Buyer: Alpine Retail Group (Switzerland)\nPayment terms: not set · Currency: CHF\nNo quotes yet.\nNo orders yet.\nRecent activity (most recent first): [call] Intro call, buyer asked about MOQ for terry towels but no follow-up sent since.`,
    rubric: 'Since the only context is an intro call about MOQ, the draft should follow up specifically on that (e.g. sharing MOQ info or asking what they need), not invent a quote or order that does not exist. It must not claim to have already sent pricing.',
  },
];

export async function evalBuyerFollowup() {
  return runJudgedEval(
    'buyer_followup',
    cases,
    async (context, tenantId) => {
      const { draft } = await draftBuyerFollowup(context, tenantId, 'eval-harness');
      return draft;
    },
    (draft: BuyerFollowup) => `Subject: ${draft.subject}\n\n${draft.body}`,
  );
}

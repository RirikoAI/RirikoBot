import type { Metadata } from 'next';
import {
  bankCapacityFor,
  dailyReward,
  MAX_BANK_BASE_CAPACITY,
  MAX_BANK_CAPACITY_PER_LEVEL,
  MAX_DAILY_BASE_REWARD,
  MAX_DAILY_MAX_STREAK_BONUS_PERCENT,
  MAX_DAILY_STREAK_BONUS_PERCENT,
} from '@ririko/core';
import { OwnerNav } from '@/components/owner-nav';
import { NumberField, SettingsForm } from '@/components/settings-form';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { saveEconomySettings } from './actions';

export const metadata: Metadata = { title: 'Economy · Owner Console · Ririko Dashboard' };

/** A streak long enough to reach any allowed maximum bonus. */
const LONGEST_STREAK = MAX_DAILY_MAX_STREAK_BONUS_PERCENT + 2;

export default async function OwnerEconomyPage() {
  await requireOwner('/owner/economy');
  const { economyConfig } = await getWebServices();
  const values = await economyConfig.get();
  const credits = (amount: number) => `${amount.toLocaleString('en-US')} credits`;

  return (
    <section className="flex flex-col gap-6">
      <OwnerNav current="/owner/economy" />
      <header>
        <h1 className="text-2xl font-bold">Economy</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Wallets, banks and the daily reward are shared by a member across every server, so they
          are set here and not per server. The bot reads these values on every use.
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Now: a first /daily pays {credits(dailyReward(1, values))}, the longest streak pays{' '}
          {credits(dailyReward(LONGEST_STREAK, values))}, and a level 10 member can bank{' '}
          {credits(bankCapacityFor(10, values))}.
        </p>
      </header>
      <SettingsForm action={saveEconomySettings}>
        <NumberField
          name="dailyBaseReward"
          label="Daily reward (credits)"
          description={`What /daily pays on the first day of a streak. At most ${MAX_DAILY_BASE_REWARD.toLocaleString('en-US')}.`}
          min={0}
          max={MAX_DAILY_BASE_REWARD}
          defaultValue={values.dailyBaseReward}
        />
        <NumberField
          name="dailyStreakBonusPercent"
          label="Streak bonus per day (%)"
          description={`Each further day of a streak adds this much of the daily reward. 5 means day 2 pays 105%. At most ${MAX_DAILY_STREAK_BONUS_PERCENT}.`}
          min={0}
          max={MAX_DAILY_STREAK_BONUS_PERCENT}
          defaultValue={values.dailyStreakBonusPercent}
        />
        <NumberField
          name="dailyMaxStreakBonusPercent"
          label="Largest streak bonus (%)"
          description={`The streak bonus stops growing here. 150 means the reward peaks at 250% of the daily reward. At most ${MAX_DAILY_MAX_STREAK_BONUS_PERCENT}.`}
          min={0}
          max={MAX_DAILY_MAX_STREAK_BONUS_PERCENT}
          defaultValue={values.dailyMaxStreakBonusPercent}
        />
        <NumberField
          name="bankBaseCapacity"
          label="Bank capacity at level 0 (credits)"
          description={`How much a new member can keep in the bank. At most ${MAX_BANK_BASE_CAPACITY.toLocaleString('en-US')}.`}
          min={0}
          max={MAX_BANK_BASE_CAPACITY}
          defaultValue={values.bankBaseCapacity}
        />
        <NumberField
          name="bankCapacityPerLevel"
          label="Bank capacity per level (credits)"
          description={`Added for each level. The level is counted from a member's XP on every server together. At most ${MAX_BANK_CAPACITY_PER_LEVEL.toLocaleString('en-US')}. Lowering capacity never removes credits: members over it can withdraw but not deposit.`}
          min={0}
          max={MAX_BANK_CAPACITY_PER_LEVEL}
          defaultValue={values.bankCapacityPerLevel}
        />
      </SettingsForm>
    </section>
  );
}

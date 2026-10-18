import type { Metadata } from 'next';
import { ACHIEVEMENT_TIERS } from '@ririko/core';
import { OwnerNav } from '@/components/owner-nav';
import {
  NumberField,
  SelectField,
  SettingsForm,
  TextField,
  ToggleField,
} from '@/components/settings-form';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { saveAchievement } from './actions';

export const metadata: Metadata = { title: 'Achievements · Owner Console · Ririko Dashboard' };

export default async function OwnerAchievementsPage() {
  await requireOwner('/owner/achievements');
  const { tcgAchievements } = await getWebServices();
  const list = await tcgAchievements.list();

  return (
    <section className="flex flex-col gap-8">
      <OwnerNav current="/owner/achievements" />
      <header>
        <h1 className="text-2xl font-bold">Waifu TCG achievements</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          What players see in <code>/achievement</code> and what claiming pays out, on every server.
          The requirement of an achievement cannot change. Achievements marked &ldquo;not tracked
          yet&rdquo; cannot be unlocked until the bot records progress for them.
        </p>
      </header>

      {list.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No achievements yet. The bot adds them when it starts.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {list.map(({ achievement, tracked }) => (
            <li key={achievement.id} className="rounded-lg border border-edge p-4">
              <p className="mb-3 text-xs text-zinc-400">
                <span className="font-mono">{achievement.code}</span> · {achievement.category} ·
                needs {achievement.requirementType} × {achievement.requirementTarget} ·{' '}
                {tracked ? (
                  <span className="text-emerald-300">tracked</span>
                ) : (
                  <span className="text-amber-300">not tracked yet</span>
                )}
              </p>
              <SettingsForm
                action={saveAchievement.bind(null, achievement.id)}
                submitLabel="Save achievement"
              >
                <TextField
                  name="title"
                  label="Title"
                  maxLength={80}
                  defaultValue={achievement.title}
                />
                <TextField
                  name="description"
                  label="Description"
                  maxLength={300}
                  defaultValue={achievement.description}
                />
                <SelectField
                  name="tier"
                  label="Tier"
                  options={ACHIEVEMENT_TIERS.map((tier) => ({ value: tier, label: tier }))}
                  defaultValue={achievement.tier}
                />
                <NumberField
                  name="rewardXp"
                  label="Reward XP"
                  min={0}
                  max={1_000_000}
                  defaultValue={achievement.rewardXp}
                />
                <NumberField
                  name="rewardCredits"
                  label="Reward credits"
                  min={0}
                  max={100_000_000}
                  defaultValue={Number(achievement.rewardCredits)}
                />
                <TextField
                  name="rewardTitle"
                  label="Reward title"
                  description="A title named in the claim message. Leave empty for none."
                  maxLength={64}
                  defaultValue={achievement.rewardTitle ?? ''}
                />
                <TextField
                  name="badgeIcon"
                  label="Badge"
                  description="An emoji shown with the achievement. Leave empty for none."
                  maxLength={32}
                  defaultValue={achievement.badgeIcon ?? ''}
                />
                <ToggleField
                  name="isHidden"
                  label="Hidden"
                  description="Hidden achievements are left out of server completion counts."
                  defaultValue={achievement.isHidden}
                />
              </SettingsForm>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import type { Metadata } from 'next';
import { ChannelListField, RoleListField } from '@/components/guild-pickers';
import { NumberField, SelectField, SettingsForm, ToggleField } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveAutoModSettings } from './actions';

export const metadata: Metadata = { title: 'AutoMod · Ririko Dashboard' };

const ACTION_OPTIONS = [
  { value: 'DELETE', label: 'Delete the message' },
  { value: 'WARN', label: 'Delete and warn (counts toward escalation)' },
  { value: 'TIMEOUT', label: 'Delete and time out for 10 minutes' },
  { value: 'KICK', label: 'Delete and kick' },
  { value: 'BAN', label: 'Delete and ban' },
];

interface RuleSection {
  key: 'inviteFilter' | 'phishingShield' | 'mentionSpam' | 'burstSpam';
  title: string;
  summary: string;
  limit?: { label: string; description: string; min: number; max: number };
}

const RULE_SECTIONS: RuleSection[] = [
  {
    key: 'phishingShield',
    title: 'Phishing shield',
    summary: 'Catches known scam links and fake Discord or Nitro domains.',
  },
  {
    key: 'inviteFilter',
    title: 'Invite filter',
    summary: 'Catches invite links to other Discord servers.',
  },
  {
    key: 'mentionSpam',
    title: 'Mention spam',
    summary: 'Catches messages that mention too many members or roles.',
    limit: {
      label: 'Mentions allowed per message',
      description: 'A message with more mentions than this is a match. 1 to 50.',
      min: 1,
      max: 50,
    },
  },
  {
    key: 'burstSpam',
    title: 'Burst spam',
    summary: 'Catches members who send many messages at once, or the same message repeatedly.',
    limit: {
      label: 'Messages allowed within 3 seconds',
      description: 'Sending more messages than this within 3 seconds is a match. 2 to 20.',
      min: 2,
      max: 20,
    },
  },
];

export default async function AutoModSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'automod');

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">AutoMod</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Filters every message as it is sent. Rules run in the order shown and stop at the first
          match. Bots, the server owner and members with Administrator, Manage Server, Manage
          Messages, Timeout Members or Ban Members are never filtered.
        </p>
      </header>
      <SettingsForm action={saveAutoModSettings.bind(null, guildId)}>
        {RULE_SECTIONS.map((rule) => (
          <fieldset
            key={rule.key}
            className="flex flex-col gap-4 rounded-md border border-edge p-4"
          >
            <legend className="px-1 text-base font-semibold text-zinc-100">{rule.title}</legend>
            <p className="-mt-2 text-sm text-zinc-400">{rule.summary}</p>
            <ToggleField
              name={`${rule.key}Enabled`}
              label={`${rule.title} on`}
              defaultValue={values[`${rule.key}Enabled`]}
            />
            <SelectField
              name={`${rule.key}Action`}
              label="When a message matches"
              defaultValue={values[`${rule.key}Action`]}
              options={ACTION_OPTIONS}
            />
            {rule.limit ? (
              <NumberField
                name={`${rule.key}Limit`}
                label={rule.limit.label}
                description={rule.limit.description}
                min={rule.limit.min}
                max={rule.limit.max}
                defaultValue={
                  rule.key === 'mentionSpam' ? values.mentionSpamLimit : values.burstSpamLimit
                }
              />
            ) : null}
            <RoleListField
              guildId={guildId}
              name={`${rule.key}ExemptRoleIds`}
              label="Roles this rule ignores"
              defaultValue={values[`${rule.key}ExemptRoleIds`]}
            />
            <ChannelListField
              guildId={guildId}
              name={`${rule.key}ExemptChannelIds`}
              label="Channels this rule ignores"
              defaultValue={values[`${rule.key}ExemptChannelIds`]}
            />
          </fieldset>
        ))}
      </SettingsForm>
    </section>
  );
}

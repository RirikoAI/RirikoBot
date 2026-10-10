import 'server-only';
import {
  MAX_BACKGROUND_UPLOAD_BYTES,
  MAX_BACKGROUND_UPLOAD_SIDE,
  MAX_WELCOMER_MESSAGE_LENGTH,
  MAX_WELCOMER_TEXT_LENGTH,
  WELCOMER_MESSAGE_VARIABLES,
  WELCOMER_TEXT_VARIABLES,
  type WelcomerCardKind,
} from '@ririko/core';
import type { WelcomeConfig } from '@ririko/database';
import { ChannelSelectField } from '@/components/guild-pickers';
import {
  ActionButtonForm,
  SettingsForm,
  TextAreaField,
  TextField,
  ToggleField,
} from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { removeCardBackground, saveCardSettings, uploadCardBackground } from './actions';

const COPY: Record<WelcomerCardKind, { title: string; intro: string; event: string }> = {
  welcome: {
    title: 'Welcome Card',
    intro: 'Ririko posts a card with the member’s avatar and name when someone joins.',
    event: 'joins',
  },
  farewell: {
    title: 'Farewell Card',
    intro: 'Ririko posts a card with the member’s avatar and name when someone leaves.',
    event: 'leaves',
  },
};

/**
 * The card as the bot draws it, from the saved settings and the viewer's own name and avatar.
 * Rendered on the server with the bot's WelcomerService (loaded only here, as it needs the
 * native canvas). The background goes through the same checks as the bot's.
 */
async function renderPreview(
  kind: WelcomerCardKind,
  row: WelcomeConfig | null,
  values: { messageTemplate: string; textColor: string },
  viewer: { name: string; avatarUrl: string },
  guild: { name: string; memberCount: number },
): Promise<string | null> {
  try {
    const { WelcomerService } = await import('@ririko/services/welcomer');
    const service = new WelcomerService();
    const card = await service.renderCard({
      userTag: viewer.name,
      avatarUrl: viewer.avatarUrl,
      memberCount: guild.memberCount,
      serverName: guild.name,
      messageText: values.messageTemplate,
      background: await service.loadBackground(row),
      textColor: values.textColor,
      isFarewell: kind === 'farewell',
    });
    return `data:image/png;base64,${card.toString('base64')}`;
  } catch (error) {
    console.error(`[web] Could not render the ${kind} card preview:`, error);
    return null;
  }
}

/** What the text message box explains: the placeholders and how `#channel-name` works. */
function textMessageHelp(kind: WelcomerCardKind): string {
  const variables = WELCOMER_TEXT_VARIABLES.map((name) => `{${name}}`).join(', ');
  const user =
    kind === 'welcome'
      ? '{user} mentions the new member and {username} is their plain name'
      : '{user} and {username} are the plain name of the member who left';
  return `Sent with the card when the box above is checked. ${variables} are replaced: ${user}. A word like #rules that names a channel of the server becomes a link to it. It never pings @everyone, @here or roles. At most ${MAX_WELCOMER_TEXT_LENGTH} characters.`;
}

/**
 * The text message as members will see it, with the viewer as the member and `#names` left as
 * typed (the dashboard does not look up the server's channels here). Null when it is off.
 */
async function renderPreviewText(
  kind: WelcomerCardKind,
  values: { textMessageEnabled: boolean; textMessage: string },
  viewerName: string,
  guild: { name: string; memberCount: number },
): Promise<string | null> {
  if (!values.textMessageEnabled || !values.textMessage) return null;
  try {
    const { fillWelcomerText } = await import('@ririko/services/welcomer');
    return fillWelcomerText(values.textMessage, {
      user: kind === 'welcome' ? `@${viewerName}` : viewerName,
      username: viewerName,
      serverName: guild.name,
      memberCount: guild.memberCount,
      channels: [],
    });
  } catch (error) {
    console.error(`[web] Could not fill the ${kind} text message preview:`, error);
    return null;
  }
}

export async function WelcomerCardPage({
  guildId,
  kind,
}: {
  guildId: string;
  kind: WelcomerCardKind;
}) {
  const { session, guild } = await requireGuildAccess(guildId);
  const { guildConfig, guildResources, userDirectory, welcomerBackgrounds } =
    await getWebServices();
  const [values, row, counts, users] = await Promise.all([
    guildConfig.get(guildId, kind),
    welcomerBackgrounds.card(guildId, kind),
    guildResources.memberCounts(guildId),
    userDirectory.lookup([session.userId]),
  ]);
  const viewer = users.get(session.userId);
  const preview = await renderPreview(
    kind,
    row,
    values,
    {
      name: viewer?.username ?? 'new-member',
      avatarUrl: viewer?.avatarUrl ?? 'https://cdn.discordapp.com/embed/avatars/0.png',
    },
    { name: guild.name, memberCount: counts.members },
  );
  const copy = COPY[kind];
  const previewText = await renderPreviewText(kind, values, viewer?.username ?? 'new-member', {
    name: guild.name,
    memberCount: counts.members,
  });

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {copy.intro} <code>/{kind === 'welcome' ? 'welcomer' : 'farewell'}</code> edits the same
          settings.
        </p>
      </header>

      <section aria-labelledby="preview-heading" className="flex max-w-3xl flex-col gap-2">
        <h2 id="preview-heading" className="text-lg font-semibold">
          Preview
        </h2>
        {preview ? (
          // A generated data URL; next/image cannot optimize it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            width={1000}
            height={400}
            alt={`The ${kind} card with your name and avatar`}
            className="h-auto w-full rounded-md border border-edge"
          />
        ) : (
          <p className="text-sm text-zinc-400">The preview could not be drawn right now.</p>
        )}
        <p className="text-xs text-zinc-500">
          Shows the saved settings with your name and avatar. Save to update it.
        </p>
        {previewText ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-zinc-200">Text message</h3>
            <p className="whitespace-pre-wrap rounded-md border border-edge p-3 text-sm text-zinc-200">
              {previewText}
            </p>
          </div>
        ) : null}
      </section>

      <SettingsForm action={saveCardSettings.bind(null, guildId, kind)}>
        <ToggleField
          name="enabled"
          label={`Post the card when a member ${copy.event}`}
          defaultValue={values.enabled}
        />
        <ChannelSelectField
          guildId={guildId}
          name="channelId"
          label="Channel"
          description="Ririko needs to send messages and attach files there."
          defaultValue={values.channelId}
          emptyLabel="No channel"
        />
        <TextAreaField
          name="messageTemplate"
          label="Message"
          description={`Shown under the name, on one line (long text is drawn smaller). ${WELCOMER_MESSAGE_VARIABLES.map((name) => `{${name}}`).join(', ')} are replaced. At most ${MAX_WELCOMER_MESSAGE_LENGTH} characters.`}
          defaultValue={values.messageTemplate}
          maxLength={MAX_WELCOMER_MESSAGE_LENGTH}
          rows={2}
        />
        <ToggleField
          name="textMessageEnabled"
          label="Also send a text message"
          description="Sent in the same message as the card."
          defaultValue={values.textMessageEnabled}
        />
        <TextAreaField
          name="textMessage"
          label="Text message"
          description={textMessageHelp(kind)}
          defaultValue={values.textMessage}
          maxLength={MAX_WELCOMER_TEXT_LENGTH}
          rows={3}
        />
        <TextField
          name="textColor"
          label="Text and border color"
          description="A color like #ffffff."
          defaultValue={values.textColor}
          maxLength={7}
        />
        <TextField
          name="backgroundUrl"
          label="Background image link"
          description="A public http or https link to a PNG, JPEG, WebP or GIF image. Setting a link replaces an uploaded image. Leave empty for the uploaded image or the default background."
          defaultValue={values.backgroundUrl ?? ''}
          maxLength={2048}
        />
      </SettingsForm>

      <section aria-labelledby="upload-heading" className="flex max-w-2xl flex-col gap-3">
        <h2 id="upload-heading" className="text-lg font-semibold">
          Uploaded background
        </h2>
        <p className="text-sm text-zinc-400">
          {row?.backgroundFile ? 'This card uses an uploaded image.' : 'No image uploaded.'} PNG,
          JPEG, WebP or GIF, up to {MAX_BACKGROUND_UPLOAD_BYTES / (1024 * 1024)} MB and{' '}
          {MAX_BACKGROUND_UPLOAD_SIDE} pixels on each side. The card is 1000×400 and the image is
          cropped to fill it. Uploading replaces the link.
        </p>
        <ActionButtonForm
          action={uploadCardBackground.bind(null, guildId, kind)}
          fields={{}}
          label="Upload"
        >
          <input
            type="file"
            name="background"
            accept="image/png,image/jpeg,image/webp,image/gif"
            required
            className="text-sm text-zinc-300"
          />
        </ActionButtonForm>
        {row?.backgroundFile || row?.backgroundUrl ? (
          <ActionButtonForm
            action={removeCardBackground.bind(null, guildId, kind)}
            fields={{}}
            label="Use the default background"
            confirmMessage="Remove this card’s background image and link?"
          />
        ) : null}
      </section>
    </section>
  );
}

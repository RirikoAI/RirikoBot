import { BsChatLeftText as ChatIcon } from "react-icons/bs";
import { GuildChannel } from "@dashboard/api/bot";
import { ChannelTypes } from "@dashboard/api/discord";
import { SelectField } from "@dashboard/components/forms/SelectField";
import { useMemo } from "react";
import { MdRecordVoiceOver } from "react-icons/md";
import { useParams } from "react-router-dom";
import { useGuildChannelsQuery } from "@dashboard/stores";
import { Params } from "@dashboard/views/feature/FeatureView";
import { Icon } from "@chakra-ui/react";

/**
 * Render an options
 */
const render = (channel: GuildChannel) => {
  const icon = () => {
    switch (channel.type) {
      case ChannelTypes.GUILD_STAGE_VOICE:
      case ChannelTypes.GUILD_VOICE: {
        return <Icon as={MdRecordVoiceOver} />;
      }
      default:
        return <ChatIcon />;
    }
  };

  return {
    label: channel.name,
    value: channel.id,
    icon: icon(),
  };
};

function mapOptions(channels: GuildChannel[]) {
  //channels in category
  const categories = new Map<string, GuildChannel[]>();
  //channels with no parent category
  const roots: GuildChannel[] = [];

  //group channels
  for (const channel of channels) {
    if (channel.category == null) roots.push(channel);
    else {
      const category = categories.get(channel.category);

      if (category == null) {
        categories.set(channel.category, [channel]);
      } else {
        category.push(channel);
      }
    }
  }

  //map channels into select menu options
  return roots.map((channel) => {
    if (channel.type === ChannelTypes.GUILD_CATEGORY) {
      return {
        ...render(channel),
        options: categories.get(channel.id)?.map(render) ?? [],
      };
    }

    return render(channel);
  });
}

export function ChannelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // @ts-ignore
  const { guild } = useParams<Params>();
  const channelsQuery = useGuildChannelsQuery(guild);
  const isLoading = channelsQuery.isLoading;

  const selected =
    value != null && channelsQuery.data?.find((c) => c.id === value);
  const options = useMemo(
    () => channelsQuery.data != null && mapOptions(channelsQuery.data),
    [channelsQuery.data]
  );

  return (
    <SelectField
      isDisabled={isLoading}
      isLoading={isLoading}
      placeholder="Select a channel"
      value={selected != null && render(selected)}
      options={options}
      onChange={(e) => onChange(e.value)}
    />
  );
}

import { Avatar, Card, CardBody, Flex, Text } from "@chakra-ui/react";
import { Guild, iconUrl } from "@dashboard/api/discord";
import { useColors } from "@dashboard/theme";

export function GuildItem({
  guild,
  active,
  onSelect,
}: {
  guild: Guild;
  active: boolean;
  onSelect: () => void;
}) {
  const { brand, globalBg } = useColors();

  return (
    <Card
      bg={active ? brand : globalBg}
      color={active && "white"}
      onClick={onSelect}
      cursor="pointer"
    >
      <CardBody as={Flex} direction="column" gap={3}>
        <Avatar name={guild.name} src={iconUrl(guild)} />
        <Text fontWeight="600">{guild.name}</Text>
      </CardBody>
    </Card>
  );
}

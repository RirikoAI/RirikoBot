import { Flex, Heading, SimpleGrid } from "@chakra-ui/layout";
import { guildI18b } from "@dashboard/utils/translationProvider";
import { CustomGuildInfo } from "@dashboard/config/types";
import { getFeatures } from "@dashboard/config/utils";
import { Banner } from "./components/Banner";
import { FeatureItem } from "./components/FeatureItem";

export function GuildPanel({
  guild: id,
  info,
}: {
  guild: string;
  info: CustomGuildInfo;
}) {
  const t = guildI18b.useTranslations();

  return (
    <Flex direction="column" gap={5}>
      <Banner />
      <Flex direction="column" gap={4}>
        <Heading fontSize="2xl">{t.features}</Heading>
        <SimpleGrid minChildWidth="328px" gap={3}>
          {getFeatures().map((feature) => (
            <FeatureItem
              key={feature.id}
              guild={id}
              feature={feature}
              enabled={info.enabledFeatures.includes(feature.id)}
            />
          ))}
        </SimpleGrid>
      </Flex>
    </Flex>
  );
}

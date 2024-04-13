import { Icon } from "@chakra-ui/react";
import { Center, Heading, Text } from "@chakra-ui/layout";
import { Button } from "@chakra-ui/react";
import { LoadingPanel } from "@dashboard/components/panel/LoadingPanel";
import { features } from "@dashboard/features";
import { FeatureConfig } from "@dashboard/config/types";
import { CustomFeatures } from "@dashboard/features";
import { BsSearch } from "react-icons/bs";
import { useParams } from "react-router-dom";
import { useEnableFeatureMutation, useFeatureQuery } from "@dashboard/stores";
import { useColors } from "@dashboard/theme";
import { UpdateFeaturePanel } from "./UpdateFeaturePanel";
import { featureI18b as view } from "@dashboard/utils/translationProvider";

export type Params = {
  guild: string;
  feature: keyof CustomFeatures;
};

export type UpdateFeatureValue<K extends keyof CustomFeatures> = Partial<
  CustomFeatures[K]
>;

export function FeatureView() {
  const { guild, feature } = useParams<Params>();
  const query = useFeatureQuery(guild, feature);
  const featureConfig = features[feature] as FeatureConfig<typeof feature>;
  const skeleton = featureConfig?.useSkeleton?.();

  if (featureConfig == null) return <NotFound />;
  if (query.isError) return <NotEnabled />;
  if (query.isLoading) return skeleton ?? <LoadingPanel size="sm" />;
  return (
    <UpdateFeaturePanel
      id={feature}
      feature={query.data}
      config={featureConfig}
    />
  );
}

function NotEnabled() {
  const t = view.useTranslations();
  const { guild, feature } = useParams<Params>();
  const { textColorSecondary } = useColors();
  const enable = useEnableFeatureMutation(guild, feature);

  return (
    <Center flexDirection="column" h="full" gap={1}>
      <Text fontSize="xl" fontWeight="600">
        {t.error["not enabled"]}
      </Text>
      <Text color={textColorSecondary}>
        {t.error["not enabled description"]}
      </Text>
      <Button
        mt={3}
        isLoading={enable.isLoading}
        onClick={() => enable.mutate({ enabled: true })}
        variant="brand"
      >
        {t.bn.enable}
      </Button>
    </Center>
  );
}

function NotFound() {
  const t = view.useTranslations();
  const { textColorSecondary } = useColors();

  return (
    <Center flexDirection="column" gap={2} h="full">
      <Icon as={BsSearch} w="50px" h="50px" />
      <Heading size="lg">{t.error["not found"]}</Heading>
      <Text color={textColorSecondary}>{t.error["not found description"]}</Text>
    </Center>
  );
}

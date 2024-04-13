import { RiErrorWarningFill as WarningIcon } from "react-icons/ri";
import { Flex, Heading, HStack, Spacer, Text } from "@chakra-ui/layout";
import { ButtonGroup, Button, Icon } from "@chakra-ui/react";
import { SlideFade } from "@chakra-ui/react";
import {
  FeatureConfig,
  FormRender,
} from "@dashboard/config/types";
import { IoSave } from "react-icons/io5";
import { useParams } from "react-router-dom";
import { useUpdateFeatureMutation } from "@dashboard/stores";
import { useColors } from "@dashboard/theme";
import { Params } from "./FeatureView";
import { featureI18b as view } from "@dashboard/utils/translationProvider";
import { CustomFeatures } from "@dashboard/features";

export function UpdateFeaturePanel<K extends keyof CustomFeatures>({
  feature,
  config,
}: {
  id: K;
  feature: CustomFeatures[K];
  config: FeatureConfig<K>;
}) {
  const result = config.useRender(feature);

  return (
    <>
      <Flex direction="column" w="full" h="full">
        <Flex direction="column" flex={1} gap={5}>
          <Heading>{config.name}</Heading>
          {result.component}
        </Flex>
      </Flex>
      <Savebar result={result} />
    </>
  );
}

function Savebar({
  result: { serialize, canSave, reset, onSubmit },
}: {
  result: FormRender;
}) {
  const { guild, feature } = useParams<Params>();
  const { cardBg } = useColors();
  const mutation = useUpdateFeatureMutation();
  const t = view.useTranslations();

  const breakpoint = "3sm";
  const onSave = () => {
    //prevent submit if returns true
    if (onSubmit?.() === true) return;

    mutation.mutate(
      {
        guild,
        feature,
        options: serialize(),
      },
      {
        onSuccess: reset,
      }
    );
  };

  return (
    <HStack
      as={SlideFade}
      in={canSave}
      bg={cardBg}
      rounded="3xl"
      zIndex="sticky"
      pos="sticky"
      bottom={{ base: 2, [breakpoint]: "10px" }}
      w="full"
      p={{ base: 1, [breakpoint]: "15px" }}
      mt={2}
    >
      <Icon
        as={WarningIcon}
        _light={{ color: "orange.400" }}
        _dark={{ color: "orange.300" }}
        w="30px"
        h="30px"
      />
      <Text fontSize={{ base: "md", [breakpoint]: "lg" }} fontWeight="500">
        {t.unsaved}
      </Text>
      <Spacer />
      <ButtonGroup
        isDisabled={mutation.isLoading}
        size={{ base: "sm", [breakpoint]: "md" }}
      >
        <Button
          variant="brand"
          leftIcon={<IoSave />}
          isLoading={mutation.isLoading}
          onClick={onSave}
        >
          {t.bn.save}
        </Button>
        <Button onClick={reset}>{t.bn.discard}</Button>
      </ButtonGroup>
    </HStack>
  );
}

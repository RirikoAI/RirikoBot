import { FiSettings as SettingsIcon } from "react-icons/fi";
import { Flex, Heading, Text } from "@chakra-ui/layout";
import { Button, ButtonGroup } from "@chakra-ui/react";
import BannerImg from "@dashboard/assets/Banner1.png";
import { useNavigate, useParams } from "react-router-dom";
import { useColors } from "@dashboard/theme";
import { guild as view } from "@dashboard/config/translations/guild";

export function Banner() {
  const { brand } = useColors();
  const { guild } = useParams();
  const navigate = useNavigate();
  const t = view.useTranslations();

  return (
    <Flex
      direction="column"
      p={{ base: 5, lg: 8 }}
      rounded="2xl"
      color="white"
      bgColor={brand}
      bgImg={{ base: null, "3sm": BannerImg }}
      bgSize="cover"
      gap={3}
      style={{backgroundPosition: "center"}}
    >
      <Heading>{t.banner.title}</Heading>
      <Text fontWeight="400" color="gray.300">
        {t.banner.description}
      </Text>
      <ButtonGroup>
        <Button
          leftIcon={<SettingsIcon />}
          color="white"
          bg="whiteAlpha.200"
          _hover={{
            bg: "whiteAlpha.300",
          }}
          _active={{
            bg: "whiteAlpha.400",
          }}
          onClick={() => navigate(`/guilds/${guild}/settings`)}
        >
          {t.bn.settings}
        </Button>
      </ButtonGroup>
    </Flex>
  );
}

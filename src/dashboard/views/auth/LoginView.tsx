import { FormControl, FormLabel } from "@chakra-ui/form-control";
import { Button, Input } from "@chakra-ui/react";
import { BsDiscord } from "react-icons/bs";
import { Box, Center, Flex, Grid, Heading } from "@chakra-ui/react";
import { ReactNode } from "react";
import { useColors } from "@dashboard/theme";
import { HomeView } from "@dashboard/views/home/HomeView";
import CloudSvg from "../../assets/Cloud.svg";
import { bot } from "@dashboard/api/bot";
import { authI18n } from "@dashboard/utils/translationProvider";

export function LoginView() {
  const t = authI18n.useTranslations();

  return (
    <AuthLayout>
      <FormControl>
        <FormLabel children={t["login description"]} />
        <a href={`${bot}/login`} target="_self">
          <Button leftIcon={<BsDiscord />} children={t.login} />
        </a>
      </FormControl>
    </AuthLayout>
  );
}

function AuthLayout({ children }: { children: ReactNode }) {
  const t = authI18n.useTranslations();
  const { globalBg, brand } = useColors();

  return (
    <Grid
      position="relative"
      templateColumns={{ base: "1fr", lg: "1fr 1fr", xl: "1fr 1.2fr" }}
      h="full"
    >
      <Center
        pos="relative"
        bg={brand}
        bgImg={CloudSvg}
        bgRepeat="no-repeat"
        bgPosition="bottom"
        flexDirection="column"
        gap={4}
        py={10}
      >
        <Heading color="white" fontSize="8xl" children={t.login} />
        <Box pos="relative" p={10} bg={globalBg} rounded="lg">
          {children}
        </Box>
      </Center>
      <Flex direction="column" bg={globalBg} p={30}>
        <HomeView />
      </Flex>
    </Grid>
  );
}

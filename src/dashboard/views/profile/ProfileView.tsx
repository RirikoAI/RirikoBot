import { Flex, Grid, Spacer, Text, VStack } from "@chakra-ui/layout";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormControl,
  FormLabel,
  Image,
  useColorMode,
  Box,
} from "@chakra-ui/react";
import { avatarUrl, bannerUrl } from "@dashboard/api/discord";
import { SelectField } from "@dashboard/components/forms/SelectField";
import { SwitchField } from "@dashboard/components/forms/SwitchField";
import { languages, names } from "@dashboard/utils/translationProvider";
import { profileI18b } from "@dashboard/utils/translationProvider";
import { IoLogOut } from "react-icons/io5";
import {
  useLogoutMutation,
  useSettingsStore,
  useSelfUser,
} from "@dashboard/stores";
import { useColors } from "@dashboard/theme";

/**
 * User info and general settings here
 */
export function ProfileView() {
  const user = useSelfUser();
  const logout = useLogoutMutation();
  const t = profileI18b.useTranslations();

  const { cardBg, brand } = useColors();
  const { colorMode, setColorMode } = useColorMode();
  const [devMode, setDevMode, lang, setLang] = useSettingsStore((s) => [
    s.devMode,
    s.setDevMode,
    s.lang,
    s.setLang,
  ]);

  return (
    <Grid
      templateColumns={{ base: "1fr", md: "minmax(0, 800px) auto" }}
      gap={{ base: 3, lg: 6 }}
    >
      <Flex direction="column" maxW="800px">
        {user.banner != null ? (
          <Image
            src={bannerUrl(user)}
            sx={{ aspectRatio: "1100 / 440" }}
            objectFit="cover"
            rounded="2xl"
          />
        ) : (
          <Box bg={brand} rounded="2xl" sx={{ aspectRatio: "1100 / 440" }} />
        )}
        <VStack mt="-50px" ml="40px" align="start">
          <Avatar
            src={avatarUrl(user)}
            name={user.username}
            w="100px"
            h="100px"
            ringColor={cardBg}
            ring="6px"
          />
          <Text fontWeight="600" fontSize="2xl">
            {user.username}
          </Text>
        </VStack>
      </Flex>
      <Card w="full" rounded="3xl" h="fit-content">
        <CardHeader fontSize="2xl">{t.settings}</CardHeader>
        <CardBody as={Flex} direction="column" gap={3} mt={3}>
          <SwitchField
            id="dark-mode"
            label={t["dark mode"]}
            desc={t["dark mode description"]}
            isChecked={colorMode === "dark"}
            onChange={(e) => setColorMode(e.target.checked ? "dark" : "light")}
          />
          <SwitchField
            id="developer-mode"
            label={t["dev mode"]}
            desc={t["dev mode description"]}
            isChecked={devMode}
            onChange={(e) => setDevMode(e.target.checked)}
          />
          <FormControl>
            <FormLabel flexDirection="column" fontSize="md">
              <Text fontWeight="600">{t.language}</Text>
              <Text color="secondaryGray.600">{t["language description"]}</Text>
            </FormLabel>
            <SelectField
              value={{
                label: names[lang],
                value: lang,
              }}
              onChange={(e) => setLang(e.value)}
              options={languages.map((lang) => ({
                label: lang.name,
                value: lang.key,
              }))}
            />
          </FormControl>
          <Spacer mt="100px" />
          <Button
            leftIcon={<IoLogOut />}
            variant="danger"
            isLoading={logout.isLoading}
            onClick={() => logout.mutate()}
          >
            {t.logout}
          </Button>
        </CardBody>
      </Card>
      <Content />
    </Grid>
  );
}

function Content() {
  return <></>;
}

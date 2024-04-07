import {
  Box,
  Center,
  Circle,
  Flex,
  Grid,
  Heading,
  HStack,
  Link,
  Spacer,
  Text,
} from "@chakra-ui/layout";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Hide,
  Icon,
  IconButton,
  Image,
  Progress,
} from "@chakra-ui/react";
import { config } from "@dashboard/config/common";
import { BiSkipNext, BiSkipPrevious } from "react-icons/bi";
import { useColors } from "@dashboard/theme";
import { StyledChart } from "@dashboard/components/chart/StyledChart";
import { dashboard } from "@dashboard/config/translations/dashboard";

import {
  BsMusicNoteBeamed,
  BsPlay,
  BsPlayBtn,
  BsShareFill,
  BsEyeFill as ViewIcon,
} from "react-icons/bs";
import { AiFillDislike, AiFillLike } from "react-icons/ai";
import { IoPricetag } from "react-icons/io5";
import { FaRobot } from "react-icons/fa";
import { MdVoiceChat } from "react-icons/md";
import { ReactElement } from "react";
import { MusicPlayer } from "@dashboard/components/music/MusicPlayer";

export function ExampleDashboardView() {
  const t = dashboard.useTranslations();
  const { globalBg, brand } = useColors();

  return (
    <Flex direction="column" gap={5}>
      <HStack rounded="2xl" bg={brand} gap={2} p={5}>
        <Circle
          color="white"
          bg="blackAlpha.300"
          p={4}
          display={{ base: "none", md: "block" }}
        >
          <Icon as={FaRobot} w="60px" h="60px" />
        </Circle>

        <Flex direction="column" align="start" gap={1}>
          <Text color="white" fontSize="2xl" fontWeight="bold">
            {t.invite.title}
          </Text>
          <Text color="whiteAlpha.800">{t.invite.description}</Text>
          <Button mt={3} as={Link} href={config.inviteUrl}>
            {t.invite.bn}
          </Button>
        </Flex>
      </HStack>
      <Grid templateColumns={{ base: "1fr", lg: "0.5fr 1fr" }} gap={3}>
        <Card rounded="3xl" variant="primary">
          <CardBody as={Center} p={4} flexDirection="column" gap={3}>
            <Circle p={4} bg={globalBg}>
              <Icon as={BsMusicNoteBeamed} w="80px" h="80px" />
            </Circle>
            <Text fontWeight="600">{t.vc.create}</Text>
          </CardBody>
        </Card>
        <Flex direction="column" gap={3}>
          <Text fontSize="xl" fontWeight="600">
            {t.vc["created channels"]}
          </Text>
          <VoiceChannelItem />
          <VoiceChannelItem />
        </Flex>
      </Grid>
      <Flex direction="column" p={3}>
        <Box w="fit-content">
          <Heading size="lg">{t.command.title}</Heading>
          <Text variant="secondary">{t.command.description}</Text>
          <Button mt={2} leftIcon={<IoPricetag />}>
            {t.pricing}
          </Button>
        </Box>
        <TestChart />
      </Flex>
    </Flex>
  );
}

function TestChart() {
  const responsive: ApexResponsive = {
    breakpoint: 500,
    options: {
      chart: {
        width: "100%",
        height: "auto",
      },
    },
  };

  return (
    <Grid templateColumns={{ base: "1fr", lg: "1fr 0.5fr" }}>
      <StyledChart
        options={{
          colors: ["#4318FF", "#39B8FF"],
          xaxis: {
            categories: ["SEP", "OCT", "NOV", "DEC", "JAN", "FEB"],
          },
          responsive: [responsive],
        }}
        series={[
          {
            name: "Paid",
            data: [50, 64, 48, 66, 49, 68],
          },
          {
            name: "Free Usage",
            data: [30, 40, 24, 46, 20, 46],
          },
        ]}
        height="300"
        type="line"
      />
      <StyledChart
        options={{
          colors: ["#4318FF", "#39B8FF"],
          labels: ["Paid", "Free Usage"],
          responsive: [responsive],
        }}
        series={[30, 1000]}
        type="pie"
        width="330"
      />
    </Grid>
  );
}




function VoiceChannelItem() {
  const { brand, textColorSecondary } = useColors();

  return (
    <Card rounded="2xl" variant="primary">
      <CardHeader as={HStack}>
        <Icon as={MdVoiceChat} w="30px" h="30px" color={brand} />
        <Text>My Channel</Text>
      </CardHeader>
      <CardBody>
        <Text color={textColorSecondary}>89 Members</Text>
      </CardBody>
    </Card>
  );
}

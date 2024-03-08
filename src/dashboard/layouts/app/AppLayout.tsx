import { Box, Flex } from "@chakra-ui/react";
import items from "@dashboard/sidebar";
import { QueryStatus } from "@dashboard/components/panel/QueryPanel";
import { useSelfUserQuery } from "@dashboard/stores";
import { LoadingPanel } from "@dashboard/components/panel/LoadingPanel";
import { DefaultNavbar } from "@dashboard/components/navbar/Navbar";
import { Outlet } from "react-router-dom";
import { Sidebar, SidebarResponsive } from "@dashboard/layouts/sidebar/Sidebar";
import { useLayoutOverride } from "@dashboard/utils/routeUtils";
import { layouts } from "@dashboard/layouts";
import { show } from "@dashboard/theme";

export default function AppLayout() {
  const query = useSelfUserQuery();

  return (
    <Flex direction="row" h="full">
      <Sidebar items={items} />
      <SidebarResponsive items={items} />
      <QueryStatus
        query={query}
        loading={<LoadingPanel size="sm" />}
        error="Failed to load user info"
      >
        <Content />
      </QueryStatus>
    </Flex>
  );
}

function Content() {
  return (
    <Flex
      pos="relative"
      direction="column"
      height="100%"
      overflow="auto"
      w="full"
      maxWidth={{ base: "100%", xl: "calc( 100% - 290px )" }}
      maxHeight="100%"
    >
      <LayoutNavbar />
      <Box
        mx="auto"
        w="full"
        maxW="1200px"
        flex={1}
        mt={{ base: "30px", [show.sidebar]: "50px" }}
        px={{ base: "10px", "3sm": "30px" }}
      >
        <Outlet />
      </Box>
    </Flex>
  );
}

function LayoutNavbar() {
  const navbar = useLayoutOverride(
    layouts,
    (layout) => layout.navbar != null
  )?.navbar;

  return (
    <Box
      top={0}
      mx="auto"
      maxW="1230px"
      zIndex="sticky"
      pos="sticky"
      w="full"
      px={{ [show.navbar]: "30px" }}
      pt={{ [show.navbar]: "16px" }}
    >
      {navbar ?? <DefaultNavbar />}
    </Box>
  );
}

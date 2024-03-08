/* eslint-disable */

import { NavLink } from "react-router-dom";
// chakra imports
import { Box, HStack, Text } from "@chakra-ui/react";
import { SidebarItemInfo } from "@dashboard/utils/routeUtils";
import { useColorsExtend, useItemHoverBg } from "@dashboard/theme";

export function SidebarItem({
  item,
  active,
}: {
  item: SidebarItemInfo;
  active: boolean;
}) {
  const { brand, globalBg, cardBg, activeColor, textColor } = useColorsExtend(
    {
      textColor: "secondaryGray.500",
      activeColor: "gray.700",
    },
    {
      textColor: "navy.100",
      activeColor: "white",
    }
  );
  const hover = useItemHoverBg();

  return (
    <NavLink to={item.path}>
      <HStack bg={cardBg} py={2} px={3} rounded="lg" {...(active && hover)}>
        <Box
          color={active ? "white" : brand}
          bg={active ? brand : globalBg}
          p={1}
          rounded="lg"
        >
          <Box w="20px" h="20px">
            {item.icon}
          </Box>
        </Box>
        <Text
          me="auto"
          color={active ? activeColor : textColor}
          fontWeight={active ? "bold" : "normal"}
        >
          {item.name}
        </Text>
      </HStack>
    </NavLink>
  );
}

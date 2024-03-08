// chakra imports
import {
  Box,
  Drawer,
  DrawerBody,
  useColorModeValue,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  Flex,
  Spacer,
} from "@chakra-ui/react";
import { BottomCard, SidebarContent } from "./components/SidebarContent";
import { AnimatePresence, motion } from "framer-motion";
import {
  SidebarItemInfo,
  useLayoutOverride,
} from "@dashboard/utils/routeUtils";
import { usePageStore } from "@dashboard/stores";
import { layouts } from "@dashboard/layouts";
import { show } from "@dashboard/theme";

export function Sidebar({ items }: { items: SidebarItemInfo[] }) {
  const shadow = useColorModeValue(
    "14px 17px 40px 4px rgba(112, 144, 176, 0.08)",
    "unset"
  );
  const sidebarBg = useColorModeValue("white", "navy.800");
  const sidebarMargins = "0px";

  const sidebar = useLayoutOverride(
    layouts,
    (layout) => layout.sidebar != null
  )?.sidebar;

  // SIDEBAR
  return (
    <Box display={{ base: "none", [show.sidebar]: "block" }} minH="100%">
      <Box
        bg={sidebarBg}
        w="300px"
        h="100vh"
        m={sidebarMargins}
        minH="100%"
        overflowX="hidden"
        boxShadow={shadow}
      >
        <Flex
          direction="column"
          height="100%"
          overflowX="hidden"
          overflowY="auto"
        >
          <AnimatePresence exitBeforeEnter initial={false}>
            <motion.div
              key={sidebar == null ? "default" : "new"}
              initial={{ x: "100px", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100px", opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              {sidebar ?? <SidebarContent items={items} />}
            </motion.div>
          </AnimatePresence>
          <Spacer />
          <BottomCard />
        </Flex>
      </Box>
    </Box>
  );
}

// FUNCTIONS
export function SidebarResponsive({ items }: { items: SidebarItemInfo[] }) {
  const sidebarBackgroundColor = useColorModeValue("white", "navy.800");

  const [isOpen, setOpen] = usePageStore((s) => [
    s.sidebarIsOpen,
    s.setSidebarIsOpen,
  ]);
  const sidebar = useLayoutOverride(
    layouts,
    (layout) => layout.sidebar != null
  )?.sidebar;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => setOpen(false)}
      placement={document.documentElement.dir === "rtl" ? "right" : "left"}
    >
      <DrawerOverlay />
      <DrawerContent w="285px" maxW="285px" bg={sidebarBackgroundColor}>
        <DrawerCloseButton
          zIndex="3"
          onClick={() => setOpen(false)}
          _focus={{ boxShadow: "none" }}
          _hover={{ boxShadow: "none" }}
        />
        <DrawerBody maxW="285px" px="0rem" pb="0">
          <Flex direction="column" height="100%" overflow="auto">
            {sidebar ?? <SidebarContent items={items} />}
            <Spacer />
            <BottomCard />
          </Flex>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

export default Sidebar;

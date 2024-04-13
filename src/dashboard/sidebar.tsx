import { Icon } from "@chakra-ui/react";
import { commonI18b } from "@dashboard/utils/translationProvider";
import { MdPerson, MdDashboard } from "react-icons/md";
import { SidebarItemInfo } from "@dashboard/utils/routeUtils";

const items: SidebarItemInfo[] = [
  {
    name: <commonI18b.T text="dashboard" />,
    path: "/user/home",
    icon: <Icon as={MdDashboard} width="20px" height="20px" color="inherit" />,
  },
  {
    name: <commonI18b.T text="profile" />,
    path: "/user/profile",
    icon: <Icon as={MdPerson} width="20px" height="20px" color="inherit" />,
  },
];

export default items;

import AuthLayout from "./layouts/auth/AuthLayout";
import AppLayout from "./layouts/app/AppLayout";
import { Navigate } from "react-router-dom";
import { RootLayout } from "./utils/routeUtils";
import { GroupNavbar } from "@dashboard/layouts/guild/GroupNavbar";
import { LoginView } from "@dashboard/views/auth/LoginView";
import { GuildView } from "@dashboard/views/guild/GuildView";
import { GuildLayout } from "@dashboard/layouts/guild/GuildLayout";
import { FeatureView } from "@dashboard/views/feature/FeatureView";
import { DashboardView } from "@dashboard/views/dashboard/DashboardView";
import { ProfileView } from "@dashboard/views/profile/ProfileView";
import { InGuildSidebar } from "@dashboard/layouts/guild/GuildSidebar";
import { GuildSettingsView } from "@dashboard/views/guild/settings/GuildSettingsView";
import { CallbackView } from "@dashboard/views/auth/CallbackView";

export const layouts: RootLayout[] = [
  {
    path: "/auth",
    component: <AuthLayout />,
    subLayouts: [
      {
        index: true,
        component: <Navigate to="/auth/signin" />,
      },
      {
        path: "signin",
        component: <LoginView />,
      },
    ],
    loggedIn: false,
  },
  {
    path: "/callback",
    component: <CallbackView />,
    loggedIn: false,
  },
  {
    component: <AppLayout />,
    subLayouts: [
      {
        path: "/guilds/:guild",
        navbar: <GroupNavbar />,
        component: <GuildLayout />,
        subLayouts: [
          {
            index: true,
            component: <GuildView />,
          },
          {
            path: "features/:feature",
            // @ts-ignore
            component: <FeatureView />,
            navbar: <GroupNavbar back />,
            sidebar: <InGuildSidebar />,
          },
          {
            path: "settings",
            component: <GuildSettingsView />,
            navbar: <GroupNavbar back />,
            sidebar: <InGuildSidebar />,
          },
        ],
      },
      {
        path: "/user",
        subLayouts: [
          {
            index: true,
            component: <Navigate to="/user/home" />,
          },
          {
            path: "home",
            component: <DashboardView />,
          },
          {
            path: "profile",
            component: <ProfileView />,
          },
        ],
      },
    ],
    loggedIn: true,
  },
  {
    path: "*",
    component: <Navigate to="/user/home" />,
    loggedIn: true,
  },
  {
    path: "*",
    component: <Navigate to="/auth/signin" />,
    loggedIn: false,
  },
];

import { Icon } from "@chakra-ui/react";
import { BsMusicNoteBeamed } from "react-icons/bs";
import { IoHappy } from "react-icons/io5";
import { useMusicFeature } from "@dashboard/features/MusicFeature";
import { FarewellMessageFeature, FeaturesConfig, MusicFeature, WelcomeMessageFeature } from "./config/types";
import { provider } from "@dashboard/config/translations/provider";
import { createI18n } from "@dashboard/hooks/i18n";
import { useWelcomeMessageFeature } from "@dashboard/features/WelcomeMessageFeature";
import { TbMessage2Plus, TbMessage2X } from "react-icons/tb";
import { RiChatVoiceLine, RiEmojiStickerLine, RiRobot2Line } from "react-icons/ri";
import { useFarewellMessageFeature } from "@dashboard/features/FarewellMessageFeature";
import { FiTwitch } from "react-icons/fi";
import { enFeatures } from "languages/en";
import { cnFeatures } from "languages/zh";
import { msFeatures } from "languages/ms";
import { jaFeatures } from "languages/ja";

/**
 * Features typing (basically some typescript shiz)
 */
export type CustomFeatures = {
  musicplayer: MusicFeature;
  twitch: any;
  reactionroles: any;
  welcome: WelcomeMessageFeature;
  farewell: FarewellMessageFeature;
  autovoicechannel: WelcomeMessageFeature;
  aichatbot: any;
};

/**
 * Support i18n (Localization)
 */
const {T} = createI18n(provider, {
  ms: msFeatures,
  en: enFeatures,
  cn: cnFeatures,
  ja: jaFeatures,
});

/**
 * Define how features are being displayed, and which data goes into the feature
 *
 * There is an example:
 */
export const features: FeaturesConfig = {
  "aichatbot": {
    name: <T text="aichatbot"/>,
    description: <T text="aichatbot description"/>,
    icon: <Icon as={ RiRobot2Line  } w={ 45 } h={ 45 }/>,
    useRender(data) {
      return {
        serialize: () => "{}",
        component: <></>,
      };
    },
  },
  "autovoicechannel": {
    name: <T text="autovoicechannel"/>,
    description: <T text="autovoicechannel description"/>,
    icon: <Icon as={ RiChatVoiceLine } w={ 45 } h={ 45 }/>,
    useRender(data) {
      return {
        serialize: () => "{}",
        component: <></>,
      };
    },
  },
  "musicplayer": {
    name: <T text="musicplayer"/>,
    description: <T text="music description"/>,
    icon: <Icon as={ BsMusicNoteBeamed } w={ 45 } h={ 45 }/>,
    useRender: (data) => {
      return useMusicFeature(data);
    },
  },
  "twitch": {
    name: <T text="twitch"/>,
    description: <T text="twitch description"/>,
    icon: <Icon as={ FiTwitch  } w={ 45 } h={ 45 }/>,
    useRender: (data) => {
      return useMusicFeature(data);
    },
  },
  "welcome": {
    name: <T text="welcome"/>,
    description: <T text="welcome description"/>,
    icon: <Icon as={ TbMessage2Plus } w={ 45 } h={ 45 }/>,
    useRender: useWelcomeMessageFeature,
  },
  "farewell": {
    name: <T text="farewell"/>,
    description: <T text="farewell description"/>,
    icon: <Icon as={ TbMessage2X } w={ 45 } h={ 45 }/>,
    useRender: useFarewellMessageFeature,
  },
  "reactionroles": {
    name: <T text="reactionroles"/>,
    description: <T text="reactionroles description"/>,
    icon: <Icon as={ RiEmojiStickerLine } w={ 45 } h={ 45 }/>,
    useRender(data) {
      return {
        serialize: () => "{}",
        component: <></>,
      };
    },
  },
};

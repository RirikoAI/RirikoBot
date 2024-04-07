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

/**
 * Define feature ids and it's option types
 */
export type CustomFeatures = {
  "musicplayer": MusicFeature;
  "twitch": any;
  "reactionroles": any;
  "welcome": WelcomeMessageFeature;
  "farewell": FarewellMessageFeature;
  "autovoicechannel": WelcomeMessageFeature;
  "aichatbot": any;
};

/**
 * Support i18n (Localization)
 */
const {T} = createI18n(provider, {
  en: {
    musicplayer: "Music Player",
    twitch: "Twitch Live Notifier",
    "twitch description": "Get notified when your favorite streamer is live",
    "music description": "Play music in Your Discord Server",
    autovoicechannel: "Auto Voice Channel",
    "autovoicechannel description": "Enable the auto voice channel feature in your server",
    aichatbot: "AI Chatbot",
    "aichatbot description": "Enable the chatbot feature in your server",
    "reaction role": "Reaction Role",
    "reaction role description": "Give user a role when clicking on a button",
    memes: "Memes Time",
    "memes description": "Send memes everyday",
  },
  cn: {
    musicplayer: "音樂播放器",
    twitch: "Twitch Live Notifier",
    "twitch description": "Get notified when your favorite streamer is live",
    "music description": "在您的 Discord 服務器中播放音樂",
    autovoicechannel: "遊戲",
    "autovoicechannel description": "Enable the auto voice channel feature in your server",
    aichatbot: "AI Chatbot",
    "aichatbot description": "Enable the chatbot feature in your server",
    "reaction role": "反應角色",
    "reaction role description": "單擊按鈕時為用戶賦予角色",
    memes: "模因時間",
    "memes description": "每天發送模因",
  },
});

/**
 * Define information for each features
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
    name: "Welcome Message",
    description: "Send message when user joined the server",
    icon: <Icon as={ TbMessage2Plus } w={ 45 } h={ 45 }/>,
    useRender: useWelcomeMessageFeature,
  },
  "farewell": {
    name: "Leave Message",
    description: "Send message when user left the server",
    icon: <Icon as={ TbMessage2X } w={ 45 } h={ 45 }/>,
    useRender: useFarewellMessageFeature,
  },
  "reactionroles": {
    name: <T text="reaction role"/>,
    description: <T text="reaction role description"/>,
    icon: <Icon as={ RiEmojiStickerLine } w={ 45 } h={ 45 }/>,
    useRender(data) {
      return {
        serialize: () => "{}",
        component: <></>,
      };
    },
  },
};

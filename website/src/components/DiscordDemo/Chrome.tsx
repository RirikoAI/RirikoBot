/**
 * The decorative parts of the demo window: title bar, server rail, channel list, member list
 * and user panel. They are drawn for realism only: hidden from assistive technology and inert.
 * Icons are simple generic shapes drawn here, not any company's logo.
 */

import type { ReactNode } from 'react';
import { Avatar, type Images } from './Message';
import { SERVER_NAME } from './reply';
import styles from './styles.module.css';

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const HashIcon = ({ size = 20 }: { size?: number }): ReactNode => (
  <Icon size={size}>
    <path d="M9 3 7 21M17 3l-2 18M4 8.5h17M3 15.5h17" />
  </Icon>
);

const SpeakerIcon = (): ReactNode => (
  <Icon>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Icon>
);

const ChevronIcon = ({ size = 12 }: { size?: number }): ReactNode => (
  <Icon size={size}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const MembersIcon = (): ReactNode => (
  <Icon>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 20a6.5 6.5 0 0 0-3-5.5" />
  </Icon>
);

export const BellIcon = (): ReactNode => (
  <Icon>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
  </Icon>
);

export const PinIcon = (): ReactNode => (
  <Icon>
    <path d="M14.5 3.5 20.5 9.5M9 9l6 6M12.5 5.5l6 6-3 1-3.5 3.5-.5 3-7-7 3-.5L11 8z M8 16l-4.5 4.5" />
  </Icon>
);

export const SearchIcon = (): ReactNode => (
  <Icon size={16}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5 5" />
  </Icon>
);

export const MenuIcon = (): ReactNode => (
  <Icon>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
);

const MicIcon = (): ReactNode => (
  <Icon>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Icon>
);

const HeadphonesIcon = (): ReactNode => (
  <Icon>
    <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
    <rect x="3" y="14" width="4.5" height="6.5" rx="1.5" />
    <rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5" />
  </Icon>
);

const GearIcon = (): ReactNode => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
  </Icon>
);

const ChatBubbleIcon = (): ReactNode => (
  <Icon size={26}>
    <path d="M4 5.5h16v10H9l-5 4z" />
  </Icon>
);

export const PlusIcon = ({ size = 20 }: { size?: number }): ReactNode => (
  <Icon size={size}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const SmileIcon = (): ReactNode => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
  </Icon>
);

export const SendIcon = (): ReactNode => (
  <Icon>
    <path d="M4 12 20 4l-4 16-4-6.5z M12 13.5 20 4" />
  </Icon>
);

export function TitleBar(): ReactNode {
  return (
    <div className={styles.titleBar} aria-hidden="true">
      <span className={styles.titleMenu}>
        <MenuIcon />
      </span>
      <span className={styles.titleText}>{SERVER_NAME}</span>
      <span className={styles.titleMobile}>
        <HashIcon size={16} /> general
      </span>
      <span className={styles.windowControls}>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M1 6h10" stroke="currentColor" />
        </svg>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" />
        </svg>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" />
        </svg>
      </span>
    </div>
  );
}

const OTHER_SERVERS = [
  { label: 'AN', color: '#f47b67' },
  { label: 'GD', color: '#3ba55c' },
  { label: 'LO', color: '#faa61a' },
];

export function ServerRail({ images }: { images: Images }): ReactNode {
  return (
    <nav className={styles.rail} aria-hidden="true">
      <span className={`${styles.railItem} ${styles.railHome}`}>
        <ChatBubbleIcon />
      </span>
      <span className={styles.railSeparator} />
      <span className={`${styles.railItem} ${styles.railActive}`}>
        <span className={styles.railPill} />
        <img src={images.avatar} alt="" width={48} height={48} loading="lazy" decoding="async" />
      </span>
      {OTHER_SERVERS.map((server) => (
        <span key={server.label} className={styles.railItem} style={{ background: server.color }}>
          {server.label}
        </span>
      ))}
      <span className={`${styles.railItem} ${styles.railAdd}`}>
        <PlusIcon size={22} />
      </span>
    </nav>
  );
}

interface Channel {
  name: string;
  active?: boolean;
  unread?: boolean;
}

const CATEGORIES: Array<{ name: string; channels: Channel[] }> = [
  { name: 'Information', channels: [{ name: 'welcome' }, { name: 'announcements' }] },
  {
    name: 'Text channels',
    channels: [
      { name: 'general', active: true },
      { name: 'music' },
      { name: 'card-drops', unread: true },
      { name: 'ririko-ai' },
    ],
  },
];

export function ChannelList({ images }: { images: Images }): ReactNode {
  return (
    <div className={styles.sidebar} aria-hidden="true">
      <div className={styles.serverHeader}>
        <span>{SERVER_NAME}</span>
        <ChevronIcon size={16} />
      </div>
      <div className={styles.channelScroller}>
        {CATEGORIES.map((category) => (
          <div key={category.name} className={styles.category}>
            <div className={styles.categoryName}>
              <ChevronIcon />
              {category.name}
            </div>
            {category.channels.map((channel) => (
              <div
                key={channel.name}
                className={`${styles.channel} ${channel.active ? styles.channelActive : ''} ${
                  channel.unread ? styles.channelUnread : ''
                }`}
              >
                <HashIcon />
                <span>{channel.name}</span>
              </div>
            ))}
          </div>
        ))}
        <div className={styles.category}>
          <div className={styles.categoryName}>
            <ChevronIcon />
            Voice channels
          </div>
          <div className={styles.channel}>
            <SpeakerIcon />
            <span>Lounge</span>
          </div>
          <div className={styles.voiceUser}>
            <span className={styles.voiceSpeaking}>
              <Avatar author="ririko" images={images} size={24} />
            </span>
            <span>Ririko</span>
          </div>
          <div className={styles.voiceUser}>
            <Avatar author="aiko" images={images} size={24} />
            <span>Aiko</span>
          </div>
          <div className={styles.channel}>
            <SpeakerIcon />
            <span>Study room</span>
          </div>
        </div>
      </div>
      <div className={styles.userPanel}>
        <span className={styles.panelAvatar}>
          <Avatar author="you" images={images} size={32} />
          <span className={styles.statusDot} />
        </span>
        <span className={styles.panelName}>
          <span>You</span>
          <span className={styles.panelStatus}>Online</span>
        </span>
        <span className={styles.panelIcons}>
          <MicIcon />
          <HeadphonesIcon />
          <GearIcon />
        </span>
      </div>
    </div>
  );
}

const MEMBERS = [
  { name: 'Hana', color: '#57f287', activity: 'Playing Tic-Tac-Toe' },
  { name: 'Kenji', color: '#faa61a', activity: null },
];

export function MemberList({ images }: { images: Images }): ReactNode {
  return (
    <aside className={styles.members} aria-hidden="true">
      <div className={styles.memberGroup}>Online — 5</div>
      <div className={styles.member}>
        <span className={styles.panelAvatar}>
          <Avatar author="ririko" images={images} size={32} />
          <span className={styles.statusDot} />
        </span>
        <span className={styles.memberText}>
          <span className={styles.memberName} style={{ color: '#ff8fd0' }}>
            Ririko <span className={styles.botTag}>APP</span>
          </span>
          <span className={styles.memberActivity}>Listening to /help</span>
        </span>
      </div>
      <div className={styles.member}>
        <span className={styles.panelAvatar}>
          <Avatar author="aiko" images={images} size={32} />
          <span className={styles.statusDot} />
        </span>
        <span className={styles.memberText}>
          <span className={styles.memberName} style={{ color: '#6fc3ff' }}>
            Aiko
          </span>
          <span className={styles.memberActivity}>Playing Waifu TCG</span>
        </span>
      </div>
      {MEMBERS.map((member) => (
        <div key={member.name} className={styles.member}>
          <span className={styles.panelAvatar}>
            <span
              className={styles.letterAvatar}
              style={{ background: member.color, width: 32, height: 32 }}
            >
              {member.name.charAt(0)}
            </span>
            <span className={styles.statusDot} />
          </span>
          <span className={styles.memberText}>
            <span className={styles.memberName}>{member.name}</span>
            {member.activity && <span className={styles.memberActivity}>{member.activity}</span>}
          </span>
        </div>
      ))}
      <div className={styles.member}>
        <span className={styles.panelAvatar}>
          <Avatar author="you" images={images} size={32} />
          <span className={styles.statusDot} />
        </span>
        <span className={styles.memberText}>
          <span className={styles.memberName}>You</span>
        </span>
      </div>
      <div className={styles.memberGroup}>Offline — 2</div>
      {['Mika', 'Ren'].map((name) => (
        <div key={name} className={`${styles.member} ${styles.memberOffline}`}>
          <span
            className={styles.letterAvatar}
            style={{ background: '#4e5058', width: 32, height: 32 }}
          >
            {name.charAt(0)}
          </span>
          <span className={styles.memberText}>
            <span className={styles.memberName}>{name}</span>
          </span>
        </div>
      ))}
    </aside>
  );
}

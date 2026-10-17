import { Fragment, type ReactNode } from 'react';
import {
  colorHex,
  coverHue,
  formatClock,
  formatShortClock,
  layoutFields,
  parseMarkdown,
  type MdNode,
} from './format';
import { DISPLAY_NAMES } from './reply';
import type {
  AuthorId,
  ButtonAction,
  CardArt,
  DemoCard,
  DemoEmbed,
  DemoMedia,
  DemoMessage,
  DemoReply,
  DemoRow,
} from './types';
import styles from './styles.module.css';

export interface Images {
  avatar: string;
  /** The card pictures the bot's card renderer drew, by `DemoCard.art`. */
  cards: Record<CardArt, string>;
}

/** Name colours, like role colours in a server. */
const NAME_COLORS: Record<AuthorId, string> = {
  ririko: '#ff8fd0',
  aiko: '#6fc3ff',
  you: '#f2f3f5',
};

const AVATAR_COLORS: Record<AuthorId, string> = {
  ririko: '#eb459e',
  aiko: '#3ba1ff',
  you: '#5865f2',
};

export function Avatar({
  author,
  images,
  size,
  className,
}: {
  author: AuthorId;
  images: Images;
  size: number;
  className?: string;
}): ReactNode {
  if (author === 'ririko') {
    return (
      <img
        className={className}
        src={images.avatar}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span
      className={`${className ?? ''} ${styles.letterAvatar}`}
      style={{ background: AVATAR_COLORS[author], width: size, height: size }}
      aria-hidden="true"
    >
      {DISPLAY_NAMES[author].charAt(0)}
    </span>
  );
}

function renderNodes(nodes: MdNode[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={index}>{node.text}</Fragment>;
      case 'br':
        return <br key={index} />;
      case 'code':
        return (
          <code key={index} className={styles.code}>
            {node.text}
          </code>
        );
      case 'bold':
        return <strong key={index}>{renderNodes(node.children)}</strong>;
      case 'italic':
        return <em key={index}>{renderNodes(node.children)}</em>;
      case 'link':
        return (
          <span key={index} className={styles.link}>
            {renderNodes(node.children)}
          </span>
        );
      case 'mention':
        return (
          <span key={index} className={styles.mention}>
            @{node.name}
          </span>
        );
      case 'time':
        return (
          <span key={index} className={styles.time}>
            {node.text}
          </span>
        );
      case 'slider':
        return (
          <span
            key={index}
            className={styles.slider}
            style={{ width: `${(node.before + node.after + 1) * 18}px` }}
            role="img"
            aria-label="Playback progress"
          >
            <span className={styles.sliderTrack} style={{ flexGrow: node.before }} />
            <span className={styles.sliderKnob} />
            <span className={styles.sliderTrack} style={{ flexGrow: node.after }} />
          </span>
        );
    }
  });
}

export function Markdown({ text }: { text: string }): ReactNode {
  return <>{renderNodes(parseMarkdown(text))}</>;
}

function CardImage({ card, images }: { card: DemoCard; images: Images }): ReactNode {
  return (
    <img
      className={styles.cardImage}
      src={images.cards[card.art]}
      alt={`${card.name} card, ${card.rarity}, ${card.element}`}
      width={256}
      height={384}
      loading="lazy"
      decoding="async"
    />
  );
}

function Media({
  media,
  images,
  thumbnail,
}: {
  media: DemoMedia;
  images: Images;
  thumbnail?: boolean;
}): ReactNode {
  if (media.type === 'card') return <CardImage card={media.card} images={images} />;
  return (
    <div
      className={`${styles.cover} ${thumbnail ? styles.coverThumb : ''}`}
      style={{ ['--cover-hue' as string]: coverHue(media.title) }}
      role="img"
      aria-label={`Cover art for ${media.title}`}
    >
      <span aria-hidden="true">♪</span>
    </div>
  );
}

function Embed({ embed, images, at }: { embed: DemoEmbed; images: Images; at: number }): ReactNode {
  const placed = layoutFields(embed.fields);
  const footer = [embed.footer, embed.timestamp ? formatClock(at) : null].filter(Boolean);
  return (
    <div className={styles.embed} style={{ borderLeftColor: colorHex(embed.color) }}>
      <div className={styles.embedGrid}>
        <div className={styles.embedMain}>
          {embed.title && (
            <div className={styles.embedTitle}>
              <Markdown text={embed.title} />
            </div>
          )}
          {embed.description && (
            <div className={styles.embedDescription}>
              <Markdown text={embed.description} />
            </div>
          )}
          {placed.length > 0 && (
            <div className={styles.fields}>
              {placed.map(({ field, column }, index) => (
                <div key={`${field.name}-${index}`} style={{ gridColumn: column }}>
                  <div className={styles.fieldName}>
                    <Markdown text={field.name} />
                  </div>
                  <div className={styles.fieldValue}>
                    <Markdown text={field.value} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {embed.image && (
            <div className={styles.embedImage}>
              <Media media={embed.image} images={images} />
            </div>
          )}
          {footer.length > 0 && <div className={styles.embedFooter}>{footer.join(' • ')}</div>}
        </div>
        {embed.thumbnail && (
          <div className={styles.thumbnail}>
            <Media media={embed.thumbnail} images={images} thumbnail />
          </div>
        )}
      </div>
    </div>
  );
}

function Rows({
  rows,
  onAction,
}: {
  rows: DemoRow[];
  onAction: (action: ButtonAction) => void;
}): ReactNode {
  return (
    <div className={styles.rows}>
      {rows.map((row, rowIndex) =>
        row.type === 'select' ? (
          <div key={rowIndex} className={styles.select} aria-hidden="true">
            <span>{row.placeholder}</span>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
        ) : (
          <div key={rowIndex} className={styles.row}>
            {row.buttons.map((button) => {
              const className = `${styles.button} ${styles[`button_${button.style}`] ?? ''} ${
                button.disabled ? styles.buttonDisabled : ''
              } ${button.iconOnly ? styles.buttonIcon : ''}`;
              const inner = (
                <>
                  {button.emoji && <span aria-hidden="true">{button.emoji}</span>}
                  <span className={button.iconOnly ? styles.srOnly : undefined}>
                    {button.label}
                  </span>
                </>
              );
              const action = button.disabled ? undefined : button.action;
              return action ? (
                <button
                  key={button.label}
                  type="button"
                  className={className}
                  onClick={() => onAction(action)}
                >
                  {inner}
                </button>
              ) : (
                <span
                  key={button.label}
                  className={`${className} ${styles.buttonStatic}`}
                  aria-hidden="true"
                >
                  {inner}
                </span>
              );
            })}
          </div>
        ),
      )}
    </div>
  );
}

function Body({
  body,
  images,
  at,
  onAction,
}: {
  body: DemoReply;
  images: Images;
  at: number;
  onAction: (action: ButtonAction) => void;
}): ReactNode {
  return (
    <>
      {body.content && (
        <div className={styles.content}>
          <Markdown text={body.content} />
        </div>
      )}
      {body.embeds.map((embed, index) => (
        <Embed key={index} embed={embed} images={images} at={at} />
      ))}
      {body.rows.length > 0 && <Rows rows={body.rows} onAction={onAction} />}
    </>
  );
}

export function Message({
  message,
  groupStart,
  images,
  onAction,
  onDismiss,
}: {
  message: DemoMessage;
  groupStart: boolean;
  images: Images;
  onAction: (action: ButtonAction) => void;
  onDismiss: (id: string) => void;
}): ReactNode {
  const { author, body } = message;
  const hasReference = Boolean(message.interaction || message.replyTo);
  const classes = [
    styles.message,
    groupStart ? styles.groupStart : '',
    hasReference ? styles.withReference : '',
    body.ephemeral ? styles.ephemeral : '',
  ].join(' ');

  return (
    <li className={classes}>
      {message.interaction && (
        <div className={styles.reference}>
          <Avatar
            author={message.interaction.user}
            images={images}
            size={16}
            className={styles.referenceAvatar}
          />
          <span
            className={styles.referenceName}
            style={{ color: NAME_COLORS[message.interaction.user] }}
          >
            {DISPLAY_NAMES[message.interaction.user]}
          </span>
          <span>used</span>
          <span className={styles.referenceCommand}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M1 1h3.6v3.6H1zM7.4 1H11v3.6H7.4zM1 7.4h3.6V11H1zM7.4 7.4H11V11H7.4z"
                fill="currentColor"
              />
            </svg>
            {message.interaction.command}
          </span>
        </div>
      )}
      {message.replyTo && (
        <div className={styles.reference}>
          <Avatar
            author={message.replyTo.user}
            images={images}
            size={16}
            className={styles.referenceAvatar}
          />
          <span
            className={styles.referenceName}
            style={{ color: NAME_COLORS[message.replyTo.user] }}
          >
            @{DISPLAY_NAMES[message.replyTo.user]}
          </span>
          <span className={styles.referenceText}>{message.replyTo.text}</span>
        </div>
      )}
      {groupStart && (
        <>
          <Avatar author={author} images={images} size={40} className={styles.avatar} />
          <h4 className={styles.messageHeader}>
            <span className={styles.username} style={{ color: NAME_COLORS[author] }}>
              {DISPLAY_NAMES[author]}
            </span>
            {author === 'ririko' && <span className={styles.botTag}>APP</span>}
            <time className={styles.timestamp} dateTime={new Date(message.at).toISOString()}>
              {formatShortClock(message.at)}
            </time>
          </h4>
        </>
      )}
      {message.pending ? (
        <div className={styles.thinking}>
          <span className={styles.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Ririko is thinking...
        </div>
      ) : (
        <Body body={body} images={images} at={message.at} onAction={onAction} />
      )}
      {body.ephemeral && !message.pending && (
        <div className={styles.ephemeralNote}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
          </svg>
          <span>Only you can see this •</span>
          <button type="button" className={styles.dismiss} onClick={() => onDismiss(message.id)}>
            Dismiss message
          </button>
        </div>
      )}
    </li>
  );
}

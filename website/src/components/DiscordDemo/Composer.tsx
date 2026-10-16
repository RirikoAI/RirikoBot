import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { PlusIcon, SendIcon, SmileIcon } from './Chrome';
import { optionSignature, suggestCommands, type DemoCatalog, type DemoCommand } from './reply';
import styles from './styles.module.css';

const MAX_SUGGESTIONS = 8;

/**
 * The message box with a slash command picker: type `/` and matching commands appear above the
 * box. Arrow keys move, Tab or Enter picks, Escape closes (combobox and listbox semantics).
 */
export function Composer({
  catalog,
  avatar,
  onSend,
}: {
  catalog: DemoCatalog;
  avatar: string;
  onSend: (text: string) => void;
}): ReactNode {
  const id = useId();
  const listId = `${id}-commands`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const suggestions =
    !dismissed && text.startsWith('/') ? suggestCommands(text, catalog, MAX_SUGGESTIONS) : [];
  const open = suggestions.length > 0;
  const current = Math.min(active, Math.max(0, suggestions.length - 1));
  const typed = text.slice(1).trim();

  const pick = (command: DemoCommand): void => {
    setText(`/${command.name} `);
    setActive(0);
    inputRef.current?.focus({ preventScroll: true });
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (text.trim() === '') return;
    onSend(text);
    setText('');
    setActive(0);
    setDismissed(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (!open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const count = suggestions.length;
      setActive((index) => (Math.min(index, count - 1) + step + count) % count);
    } else if (event.key === 'Tab' || event.key === 'Enter') {
      const command = suggestions[current];
      if (!command) return;
      event.preventDefault();
      pick(command);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDismissed(true);
    }
  };

  return (
    <div className={styles.composer}>
      {open && (
        <div className={styles.autocomplete}>
          <div className={styles.autocompleteHeader} aria-hidden="true">
            {typed === '' ? 'Commands' : `Commands matching /${typed}`}
          </div>
          <div id={listId} role="listbox" aria-label="Commands" className={styles.autocompleteList}>
            {suggestions.map((command, index) => {
              const signature = optionSignature(command);
              return (
                <div
                  key={command.name}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === current}
                  className={`${styles.option} ${index === current ? styles.optionActive : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(command);
                  }}
                  onMouseEnter={() => setActive(index)}
                >
                  <img
                    className={styles.optionIcon}
                    src={avatar}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className={styles.optionMain}>
                    <span className={styles.optionName}>
                      /{command.name}
                      {signature !== '' && (
                        <span className={styles.optionArgs}>
                          {command.options.map((option) => (
                            <span key={option.name} className={styles.optionArg}>
                              {option.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className={styles.optionDescription}>{command.description}</span>
                  </span>
                  <span className={styles.optionApp}>Ririko AI</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <form className={styles.form} onSubmit={submit}>
        <span className={styles.formIcon} aria-hidden="true">
          <PlusIcon />
        </span>
        <label htmlFor={`${id}-input`} className={styles.srOnly}>
          Message #general. Type / for commands.
        </label>
        <input
          id={`${id}-input`}
          ref={inputRef}
          className={styles.input}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${current}` : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={200}
          placeholder="Message #general"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setDismissed(false);
          }}
          onKeyDown={onKeyDown}
        />
        <span className={styles.formIcon} aria-hidden="true">
          <SmileIcon />
        </span>
        <button type="submit" className={styles.sendButton} aria-label="Send message">
          <SendIcon />
        </button>
      </form>
    </div>
  );
}

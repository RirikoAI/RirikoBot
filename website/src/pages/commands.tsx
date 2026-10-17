import { useMemo, useState, type ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useBrokenLinks from '@docusaurus/useBrokenLinks';
import Layout from '@theme/Layout';
import catalog from '../data/commands.json';
import styles from './commands.module.css';

interface CatalogOption {
  name: string;
  description: string;
  type: string;
  required: boolean;
  choices: { name: string; value: string | number }[];
}

interface CatalogCommand {
  name: string;
  category: string;
  description: string;
  aliases: string[];
  usage: string | null;
  examples: string[];
  options: CatalogOption[];
  permissions: string[];
  slash: boolean;
  prefix: boolean;
  cooldownSeconds: number;
}

const COMMANDS = catalog.commands as CatalogCommand[];

function matches(command: CatalogCommand, query: string): boolean {
  if (query === '') return true;
  const haystack = [command.name, command.description, ...command.aliases].join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

function CommandEntry({ command }: { command: CatalogCommand }): ReactNode {
  const forms = [command.slash ? 'slash' : null, command.prefix ? 'prefix' : null].filter(Boolean);
  return (
    <details className={styles.command}>
      <summary>
        <code>{command.name}</code>
        <span className={styles.summaryText}> {command.description}</span>
      </summary>
      <div className={styles.body}>
        {command.usage && (
          <p>
            <strong>Usage:</strong> <code>{command.usage}</code>
          </p>
        )}
        {command.examples.length > 0 && (
          <>
            <strong>Examples</strong>
            <ul>
              {command.examples.map((example) => (
                <li key={example}>
                  <code>{example}</code>
                </li>
              ))}
            </ul>
          </>
        )}
        {command.options.length > 0 && (
          <>
            <strong>Options</strong>
            <ul>
              {command.options.map((option) => (
                <li key={option.name}>
                  <code>{option.name}</code> ({option.type.toLowerCase()}
                  {option.required ? ', required' : ', optional'}): {option.description}
                  {option.choices.length > 0 && (
                    <> Choices: {option.choices.map((choice) => choice.name).join(', ')}.</>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={styles.meta}>
          {command.aliases.length > 0 && <>Aliases: {command.aliases.join(', ')}. </>}
          Works as: {forms.join(' and ')}.{' '}
          {command.permissions.length > 0
            ? `Needs: ${command.permissions.join(', ')}. `
            : 'Anyone can use it. '}
          {command.cooldownSeconds > 0 && `Cooldown: ${command.cooldownSeconds} seconds.`}
        </p>
      </div>
    </details>
  );
}

export default function Commands(): ReactNode {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  // Every category section has an id the home page links to (/commands#music): tell the build.
  const brokenLinks = useBrokenLinks();
  for (const item of catalog.categories) brokenLinks.collectAnchor(item.id);

  const visible = useMemo(
    () =>
      COMMANDS.filter(
        (command) =>
          (category === 'all' || command.category === category) && matches(command, query),
      ),
    [query, category],
  );

  return (
    <Layout
      title="Command reference"
      description="Every Ririko AI command, with options, examples and permissions."
    >
      <main className="container margin-vert--lg">
        <h1>Command reference</h1>
        <p>
          {COMMANDS.length} commands in {catalog.categories.length} categories. Every command works
          as a slash command or with the prefix <code>{catalog.prefix}</code>. For how commands and
          permissions work, read <Link to="/docs/commands">Commands</Link> in the docs.
        </p>
        <input
          type="search"
          className={styles.search}
          placeholder="Search for a command"
          aria-label="Search for a command"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.filters} role="group" aria-label="Category">
          <button
            type="button"
            className={`button button--sm ${category === 'all' ? 'button--primary' : 'button--outline button--primary'}`}
            onClick={() => setCategory('all')}
          >
            All
          </button>
          {catalog.categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`button button--sm ${category === item.id ? 'button--primary' : 'button--outline button--primary'}`}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {visible.length === 0 && <p>No command matches your search.</p>}
        {catalog.categories.map((item) => {
          const inCategory = visible.filter((command) => command.category === item.id);
          if (inCategory.length === 0) return null;
          return (
            <section key={item.id} id={item.id} className={styles.category}>
              <h2>{item.label}</h2>
              <p>{item.description}</p>
              {inCategory.map((command) => (
                <CommandEntry key={command.name} command={command} />
              ))}
            </section>
          );
        })}
      </main>
    </Layout>
  );
}

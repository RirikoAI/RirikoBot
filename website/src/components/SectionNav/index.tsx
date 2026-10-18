import { useEffect, useState, type ReactNode } from 'react';
import styles from './styles.module.css';

export interface NavSection {
  id: string;
  label: string;
}

interface SectionNavProps {
  sections: NavSection[];
}

/**
 * A vertical dot navigator for the home page. Every dot is a plain anchor, so it works without
 * JavaScript; the script only marks the section in the middle of the screen as the current one.
 */
export default function SectionNav({ sections }: SectionNavProps): ReactNode {
  const [active, setActive] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined;
    // A thin band across the middle of the screen: the section inside it is the current one.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className={styles.nav} aria-label="Sections of this page">
      <ul className={styles.list}>
        {sections.map((section) => {
          const current = section.id === active;
          return (
            <li key={section.id} className={styles.item}>
              <a
                className={styles.link}
                href={`#${section.id}`}
                aria-label={`Go to section: ${section.label}`}
                aria-current={current ? 'location' : undefined}
              >
                <span className={styles.label} aria-hidden="true">
                  {section.label}
                </span>
                <span className={styles.dot} aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

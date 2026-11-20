import '@fontsource-variable/fredoka';
import { useTheme } from '@/ui/theme';
import { contacts, FEEDBACK_FORM, GITHUB } from './content';
import HeroSection from './HeroSection';
import StructurePicker from './StructurePicker';
import About from './About';
import Sponsors from './Sponsors';
import styles from './Landing.module.css';

const Landing = () => {
  const theme = useTheme();

  return (
    <div className={styles.page} data-theme={theme}>
      <title>structs.sh</title>
      <HeroSection />

      <main>
        <StructurePicker />
        <About />
        <Sponsors />
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <span>© {new Date().getFullYear()} DevSoc UNSW</span>
          <nav aria-label="Project">
            <a href={GITHUB} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={FEEDBACK_FORM} target="_blank" rel="noreferrer">
              Feedback
            </a>
            {contacts.map((contact) => (
              <a
                key={contact.href}
                href={contact.href}
                target={contact.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
              >
                {contact.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default Landing;

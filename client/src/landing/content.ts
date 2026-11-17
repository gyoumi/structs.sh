import airwallexLogo from '@/assets/img/sponsors/airwallex.avif';
import aristaLogo from '@/assets/img/sponsors/arista.png';
import atlassianLogo from '@/assets/img/sponsors/atlassian.png';
import hrtLogo from '@/assets/img/sponsors/hrt.png';
import janeStreetLogo from '@/assets/img/sponsors/jane_street.svg';
import lyraLogo from '@/assets/img/sponsors/lyra.svg';
import qrtLogo from '@/assets/img/sponsors/qrt.svg';
import theTradeDeskLogo from '@/assets/img/sponsors/thetradedesk.png';

/* The landing page words come from the current site. */

export const GITHUB = 'https://github.com/devsoc-unsw/structs.sh';

export const DESCRIPTION =
  'An interactive learning platform for computer science, tailored to UNSW CSE students.';

export const OPEN_SOURCE =
  'Developed and maintained by passionate CS and engineering students at UNSW.';

export const features = [
  'Visualise algorithms for fundamental operations on classic data structures such as linked lists, binary search trees and graphs.',
  'Granular animation control with play/pause, stepping, slider and speed control',
  'Control the visualiser through a simple menu',
];

interface Sponsor {
  name: string;
  logo: string;
  href: string;
  /** Logo height in pixels, set per logo so the wordmarks look a similar size. */
  height: number;
}

export const tiers: { name: string; sponsors: Sponsor[] }[] = [
  {
    name: 'Platinum',
    sponsors: [
      {
        name: 'Hudson River Trading',
        logo: hrtLogo,
        href: 'https://www.hudsonrivertrading.com/',
        height: 44,
      },
      {
        name: 'Jane Street',
        logo: janeStreetLogo,
        href: 'https://www.janestreet.com/',
        height: 38,
      },
      {
        name: 'Lyra Technologies',
        logo: lyraLogo,
        href: 'https://www.lyratechnologies.com.au/',
        height: 46,
      },
      {
        name: 'The Trade Desk',
        logo: theTradeDeskLogo,
        href: 'https://careers.thetradedesk.com/',
        height: 30,
      },
    ],
  },
  {
    name: 'Gold',
    sponsors: [
      { name: 'Airwallex', logo: airwallexLogo, href: 'https://www.airwallex.com/au', height: 36 },
      { name: 'Arista', logo: aristaLogo, href: 'https://www.arista.com/en/', height: 26 },
      { name: 'Atlassian', logo: atlassianLogo, href: 'https://www.atlassian.com/', height: 24 },
      { name: 'QRT', logo: qrtLogo, href: 'https://www.qube-rt.com/', height: 34 },
    ],
  },
];

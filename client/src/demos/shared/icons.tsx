import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const Icon = ({ children, ...props }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
    className="sx-icon"
    {...props}
  >
    {children}
  </svg>
);

export const PlayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
  </Icon>
);

export const PauseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 5v14M17 5v14" strokeWidth="3.5" />
  </Icon>
);

export const ReplayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 12a8 8 0 1 0 2.6-5.9" />
    <path d="M4 4v5h5" />
  </Icon>
);

export const StepForwardIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 5v14l10-7z" fill="currentColor" />
    <path d="M19 5v14" />
  </Icon>
);

export const StepBackIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M18 5v14L8 12z" fill="currentColor" />
    <path d="M5 5v14" />
  </Icon>
);

export const ToStartIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 6v12l-8-6zM21 6v12l-8-6z" fill="currentColor" />
  </Icon>
);

export const ToEndIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 6v12l8-6zM12 6v12l8-6z" fill="currentColor" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const MinusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14" />
  </Icon>
);

export const FitIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
);

export const ShuffleIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 7h3.5c2.5 0 3.8 1.4 5 3.5l1 1.8c1.2 2.1 2.5 3.7 5 3.7H21" />
    <path d="M3 17h3.5c1.4 0 2.4-.5 3.2-1.3M14.3 8.3c.8-.8 1.8-1.3 3.2-1.3H21" />
    <path d="m18 4 3 3-3 3M18 14l3 3-3 3" />
  </Icon>
);

export const ClearIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
  </Icon>
);

export const CodeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
  </Icon>
);

export const KeyboardIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" />
  </Icon>
);

export const ChevronIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const BugIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="8" y="7" width="8" height="12" rx="4" />
    <path d="M9 5l1.5 2M15 5l-1.5 2M8 11H4M8 15H4.5M16 11h4M16 15h3.5M12 11v8" />
  </Icon>
);

export const InfoIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.01" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const RestoreIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 12a8 8 0 1 1 2.6 5.9" />
    <path d="M4 20v-5h5" />
  </Icon>
);

export const ArrowIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const BackspaceIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" />
    <path d="m12 9.5 5 5M17 9.5l-5 5" />
  </Icon>
);

export const DiceIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" strokeWidth="2.5" />
  </Icon>
);

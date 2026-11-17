import { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const Icon = ({ size = 20, children, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {children}
  </svg>
);

export const PlayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
  </Icon>
);

export const PauseIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const ReplayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </Icon>
);

export const StepForwardIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 5v14l9-7z" fill="currentColor" stroke="none" />
    <path d="M18 5v14" />
  </Icon>
);

export const StepBackIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M18 5v14l-9-7z" fill="currentColor" stroke="none" />
    <path d="M6 5v14" />
  </Icon>
);

export const ToStartIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 5v14l-7-7z M13 5v14l-7-7z" fill="currentColor" stroke="none" />
    <path d="M4 5v14" />
  </Icon>
);

export const ToEndIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 5v14l7-7z M11 5v14l7-7z" fill="currentColor" stroke="none" />
    <path d="M20 5v14" />
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
    <path d="M3 7h3.5c2 0 3.3 1 4.4 2.6l2.2 3.3C14.2 14.5 15.5 17 18 17h3" />
    <path d="M3 17h3.5c1.4 0 2.4-.6 3.3-1.5M14.2 8.5c.9-.9 2-1.5 3.8-1.5h3" />
    <path d="M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5" />
  </Icon>
);

export const ClearIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </Icon>
);

export const KeyboardIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6.5 10h1M10.5 10h1M14.5 10h1M8 14h8" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const ArrowIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </Icon>
);

export const TerminalIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 8 4 4-4 4M12 16h7" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const SunIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </Icon>
);

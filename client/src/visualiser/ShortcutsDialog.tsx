import { ReactNode } from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@ui-sdk/react/dialog';
import { CloseIcon } from '@/ui/icons';

export const shortcutList: { keys: string[]; action: string }[] = [
  { keys: ['Space'], action: 'Play or pause' },
  { keys: ['←', '→'], action: 'Step backward or forward' },
  { keys: ['Home', 'End'], action: 'Jump to the start or the end' },
  { keys: ['Scroll', 'Drag'], action: 'Zoom and pan the drawing' },
  { keys: ['+', '−', '0'], action: 'Zoom or fit, with the drawing focused' },
  { keys: ['Enter'], action: 'Run the operation you are typing into' },
];

interface ShortcutsDialogProps {
  trigger: ReactNode;
  triggerClassName?: string;
  backdropClassName?: string;
  contentClassName?: string;
  closeClassName?: string;
  title?: string;
  description?: string;
}

const ShortcutsDialog = ({
  trigger,
  triggerClassName,
  backdropClassName,
  contentClassName,
  closeClassName,
  title = 'Keyboard shortcuts',
  description = 'Drive the visualiser without leaving the keyboard.',
}: ShortcutsDialogProps) => (
  <Dialog>
    <DialogTrigger className={triggerClassName} aria-label={title}>
      {trigger}
    </DialogTrigger>
    <DialogBackdrop className={backdropClassName} />
    <DialogContent className={contentClassName}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <dl>
        {shortcutList.map((item) => (
          <div key={item.action}>
            <dt>
              {item.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dt>
            <dd>{item.action}</dd>
          </div>
        ))}
      </dl>
      <DialogClose className={closeClassName} aria-label="Close">
        <CloseIcon size={18} />
      </DialogClose>
    </DialogContent>
  </Dialog>
);

export default ShortcutsDialog;

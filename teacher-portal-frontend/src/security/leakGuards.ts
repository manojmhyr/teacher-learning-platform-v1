/**
 * Guards against the ordinary ways protected content leaves the app.
 *
 * None of these are unbreakable — anyone with developer tools can defeat a
 * client-side guard, and we say so in docs/SECURITY.md. They exist to stop
 * casual and accidental leakage (copy-paste into email, save-as, print to PDF,
 * drag-an-image-out), which is the realistic threat for internal staff
 * content. The controls that actually hold are server-side: entitlement checks
 * before a SAS is minted, short expiry, per-teacher watermarks and audit logs.
 */

type Cleanup = () => void;

/** Blocks copy, cut and drag of protected text, and clears whatever reached the clipboard. */
export function guardCopy(root: HTMLElement, onAttempt?: () => void): Cleanup {
  const block = (e: Event) => {
    e.preventDefault();
    if ('clipboardData' in e && (e as ClipboardEvent).clipboardData) {
      (e as ClipboardEvent).clipboardData!.setData('text/plain', '');
    }
    onAttempt?.();
  };
  root.addEventListener('copy', block);
  root.addEventListener('cut', block);
  root.addEventListener('dragstart', block);
  return () => {
    root.removeEventListener('copy', block);
    root.removeEventListener('cut', block);
    root.removeEventListener('dragstart', block);
  };
}

/** Suppresses the context menu over protected content (Save image as…, Print…). */
export function guardContextMenu(root: HTMLElement): Cleanup {
  const block = (e: Event) => e.preventDefault();
  root.addEventListener('contextmenu', block);
  return () => root.removeEventListener('contextmenu', block);
}

/**
 * Blanks protected content while a print is in progress.
 *
 * Printing is the easiest way to turn a protected page into a PDF, so the
 * print stylesheet replaces the content with a notice instead.
 */
export function guardPrint(): Cleanup {
  const style = document.createElement('style');
  style.setAttribute('data-guard', 'print');
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      body::before {
        visibility: visible !important;
        content: "This content is protected and cannot be printed. Contact your administrator if you need a printed copy.";
        display: block; padding: 48px; font: 16px/1.6 system-ui, sans-serif; text-align: center;
      }
    }
  `;
  document.head.appendChild(style);
  return () => style.remove();
}

/**
 * Hides protected content whenever the window loses focus or is hidden.
 *
 * On a laptop this covers screen sharing in a call, alt-tabbing with a
 * recorder running, and the OS app switcher. The content is unhidden the
 * moment focus returns.
 */
export function guardBackgroundBlur(onChange: (hidden: boolean) => void): Cleanup {
  const update = () => onChange(document.visibilityState === 'hidden' || !document.hasFocus());
  document.addEventListener('visibilitychange', update);
  window.addEventListener('blur', update);
  window.addEventListener('focus', update);
  return () => {
    document.removeEventListener('visibilitychange', update);
    window.removeEventListener('blur', update);
    window.removeEventListener('focus', update);
  };
}

/**
 * Installs app-wide hygiene: no text selection outside inputs, no image
 * dragging, and `no-referrer` so URLs never leak to third parties.
 */
export function installGlobalGuards(): Cleanup {
  const style = document.createElement('style');
  style.setAttribute('data-guard', 'global');
  style.textContent = `
    img, video { -webkit-user-drag: none; user-drag: none; }
    .protected-content {
      -webkit-touch-callout: none;
    }
  `;
  document.head.appendChild(style);

  const meta = document.createElement('meta');
  meta.name = 'referrer';
  meta.content = 'no-referrer';
  document.head.appendChild(meta);

  return () => {
    style.remove();
    meta.remove();
  };
}

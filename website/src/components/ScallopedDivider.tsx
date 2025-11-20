/**
 * DEPRECATED: ScallopedDivider — removed per WEBSITE_FIX final sweep
 * This component is now a no-op placeholder to prevent import errors during migration.
 * Please remove usages entirely or replace with tokenized spacing/elevation patterns.
 */
interface ScallopedDividerProps {
  color?: 'yellow' | 'blue' | 'cream' | 'white' | string;
  position?: 'top' | 'bottom';
  className?: string;
}

let warned = false;
export default function ScallopedDivider(_props: ScallopedDividerProps) {
  if (process.env.NODE_ENV !== 'production' && !warned) {
    // eslint-disable-next-line no-console
    console.warn('[ScallopedDivider] Deprecated: this decorative component has been removed. Please delete its usage.');
    warned = true;
  }
  return null;
}

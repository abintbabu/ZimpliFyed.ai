'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// Distinct in-app paths visited this browser session. Module state resets on a
// full page load (deep link), so BackButton only calls router.back() when the
// previous history entry is known to be inside the app shell.
const visitedPaths = new Set<string>();

export function trackAppPath(pathname: string) {
  visitedPaths.add(pathname);
}

function hasInAppHistory(): boolean {
  return visitedPaths.size > 1;
}

type BackButtonProps = {
  /** Where to go when there is no in-app history (deep link / fresh tab). */
  fallback: string;
  label?: string;
  className?: string;
};

export function BackButton({ fallback, label = 'Back', className }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (hasInAppHistory() && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink transition-colors',
        className
      )}
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </button>
  );
}

'use client';

import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BulkAction {
  label: string;
  icon?: LucideIcon;
  variant?: 'default' | 'danger';
  onClick: () => Promise<void>;
}

export interface BulkActionToolbarProps {
  /** Number of currently selected rows */
  selectedCount: number;
  /** Available bulk actions */
  actions: BulkAction[];
  /** Clear selection callback */
  onClearSelection: () => void;
  /** Total number of rows (for "N of M selected" display) */
  totalCount: number;
  /** Optional className */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BulkActionToolbar({
  selectedCount,
  actions,
  onClearSelection,
  totalCount,
  className,
}: BulkActionToolbarProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);

  // Don't render if nothing is selected
  if (selectedCount === 0) return null;

  const handleActionClick = async (action: BulkAction) => {
    if (action.variant === 'danger') {
      setConfirmAction(action);
      return;
    }
    await executeAction(action);
  };

  const executeAction = async (action: BulkAction) => {
    setLoadingAction(action.label);
    try {
      await action.onClick();
    } finally {
      setLoadingAction(null);
      setConfirmAction(null);
    }
  };

  return (
    <>
      {/* Toolbar bar */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-50
          flex flex-wrap items-center gap-3 px-4 py-3
          border-t border-[var(--border-color)] shadow-[0_-4px_24px_rgba(0,0,0,0.4)]
          animate-slide-up
          ${className ?? ''}
        `}
        style={{ background: 'var(--bg-secondary)' }}
        role="toolbar"
        aria-label="Bulk actions"
      >
        {/* Selection count */}
        <span className="text-sm text-[var(--text-primary)] font-medium mr-2">
          {selectedCount} of {totalCount} selected
        </span>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            const isLoading = loadingAction === action.label;
            const isDanger = action.variant === 'danger';

            return (
              <Button
                key={action.label}
                variant={isDanger ? 'destructive' : 'secondary'}
                size="sm"
                className={`
                  gap-1.5 text-xs
                  ${isDanger ? 'bg-red-600/90 hover:bg-red-600 text-white' : ''}
                `}
                disabled={loadingAction !== null}
                onClick={() => handleActionClick(action)}
              >
                {isLoading ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : Icon ? (
                  <Icon className="h-3.5 w-3.5" />
                ) : null}
                {action.label}
              </Button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clear selection */}
        <button
          onClick={onClearSelection}
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Clear selection
        </button>
      </div>

      {/* Danger confirmation dialog */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <AlertDialogContent style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[var(--text-primary)]">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Confirm {confirmAction?.label}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--text-muted)]">
              This action will affect{' '}
              <strong className="text-[var(--text-primary)]">{selectedCount}</strong>{' '}
              selected item{selectedCount !== 1 ? 's' : ''}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--border-color)] text-[var(--text-primary)]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (confirmAction) executeAction(confirmAction);
              }}
            >
              {confirmAction?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default BulkActionToolbar;

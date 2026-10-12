'use client';

// components/ExpenseFilters.tsx
// Real-time Text Search & Category Filter Chips for Group Expenses
// Implements T-2.4.2 for fast client-side query filtering across expenses.

import React from 'react';

export interface ExpenseFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  totalCount: number;
  filteredCount: number;
}

export const FILTER_CATEGORIES = [
  { id: 'all', label: 'All', icon: '🏷️' },
  { id: 'food', label: 'Food', icon: '🍽️', matches: ['food', 'drinks', 'groceries'] },
  { id: 'transport', label: 'Transport', icon: '🚕', matches: ['transport', 'taxi', 'fuel'] },
  { id: 'utilities', label: 'Utilities', icon: '💡', matches: ['utilities', 'bills'] },
  { id: 'entertainment', label: 'Fun', icon: '🎟️', matches: ['entertainment', 'movies'] },
  { id: 'lodging', label: 'Lodging', icon: '🏨', matches: ['lodging', 'hotel', 'stay'] },
  { id: 'other', label: 'Other', icon: '📦', matches: ['other', 'general', 'shopping'] },
];

export function ExpenseFilters({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  totalCount,
  filteredCount,
}: ExpenseFiltersProps) {
  const isFiltered = searchQuery.trim().length > 0 || selectedCategory !== 'all';

  const clearFilters = () => {
    onSearchChange('');
    onCategoryChange('all');
  };

  return (
    <div className="space-y-3">
      {/* Search Input Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by title, notes, or tags..."
          className="w-full pl-9 pr-9 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all shadow-inner"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="Clear search query"
          >
            <span className="w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center justify-center text-[10px] font-bold">
              ✕
            </span>
          </button>
        )}
      </div>

      {/* Category Chips & Filter Status */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
        <div className="flex items-center gap-1.5 shrink-0">
          {FILTER_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryChange(cat.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-sm font-semibold scale-[1.02]'
                    : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-700/40'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Clear Filters summary button */}
        {isFiltered && (
          <div className="flex items-center gap-2 shrink-0 pl-2">
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {filteredCount} of {totalCount}
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 underline underline-offset-2"
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

// components/ExpenseFilters.tsx
// Stitch Neo-Brutalist Search & Category Filter Chips

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
  { id: 'all', label: 'ALL', icon: '🏷️' },
  { id: 'food', label: 'FOOD', icon: '🍽️', matches: ['food', 'drinks', 'groceries'] },
  { id: 'transport', label: 'TRANSPORT', icon: '🚕', matches: ['transport', 'taxi', 'fuel'] },
  { id: 'utilities', label: 'BILLS', icon: '💡', matches: ['utilities', 'bills'] },
  { id: 'entertainment', label: 'FUN', icon: '🎟️', matches: ['entertainment', 'movies'] },
  { id: 'lodging', label: 'STAY', icon: '🏨', matches: ['lodging', 'hotel', 'stay'] },
  { id: 'other', label: 'OTHER', icon: '📦', matches: ['other', 'general', 'shopping'] },
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
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-black font-black">
          <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="SEARCH TITLE, NOTES OR #TAGS..."
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white border-2 border-black text-xs font-mono font-bold text-black placeholder:text-black/40 focus:outline-none focus:bg-[#faffea] shadow-[2px_2px_0px_0px_#000]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-black"
            aria-label="Clear search query"
          >
            <span className="w-5 h-5 rounded border border-black bg-[#ffd600] text-black flex items-center justify-center text-[10px] font-black">
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-black border-2 border-black transition-all shadow-[1.5px_1.5px_0px_0px_#000] cursor-pointer ${
                  isSelected
                    ? 'bg-black text-[#ccff00]'
                    : 'bg-white text-black hover:bg-[#fafaf6]'
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
            <span className="text-[11px] font-mono text-black/60 font-bold">
              {filteredCount}/{totalCount}
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-mono font-black bg-[#ff8a80] text-black border border-black px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_#000]"
            >
              RESET
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

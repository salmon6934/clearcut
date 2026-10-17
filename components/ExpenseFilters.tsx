'use client';

// components/ExpenseFilters.tsx
// Brew & Browse Warm Cafe Search & Category Filter Chips

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
  { id: 'transport', label: 'Transit', icon: '🚕', matches: ['transport', 'taxi', 'fuel'] },
  { id: 'utilities', label: 'Bills', icon: '💡', matches: ['utilities', 'bills'] },
  { id: 'entertainment', label: 'Fun', icon: '🎟️', matches: ['entertainment', 'movies'] },
  { id: 'lodging', label: 'Stay', icon: '🏨', matches: ['lodging', 'hotel', 'stay'] },
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
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8D7868]">
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
          placeholder="Search title, notes, or tags..."
          className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-white border border-[#E5D9CC] text-xs sm:text-sm font-medium text-[#432E22] placeholder:text-[#8D7868]/60 focus:outline-none focus:border-[#543A2A] shadow-xs transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8D7868] hover:text-[#432E22]"
            aria-label="Clear search query"
          >
            <span className="w-5 h-5 rounded-full bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center text-[10px] font-bold">
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#543A2A] text-[#FAF6F0] shadow-xs'
                    : 'bg-white text-[#432E22] border border-[#E5D9CC] hover:bg-[#FAF6F0]'
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
            <span className="text-xs text-[#8D7868] font-medium">
              {filteredCount}/{totalCount}
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-bold bg-[#FCE8E6] text-[#A83232] border border-[#F5C2C0] px-2.5 py-0.5 rounded-full hover:bg-[#F8D8D5] transition-colors"
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

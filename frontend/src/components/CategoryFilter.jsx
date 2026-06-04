import { useEffect, useState } from 'react';
import api from '../utils/api';

const DEFAULT_CATEGORIES = [
  { value: 'ALL', label: 'All Events' },
  { value: 'MUSIC', label: 'Music' },
  { value: 'TECH', label: 'Tech' },
  { value: 'SPORTS', label: 'Sports' },
  { value: 'ARTS', label: 'Arts' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'FOOD', label: 'Food' },
  { value: 'HEALTH', label: 'Health' },
  { value: 'SOCIAL', label: 'Social' },
  { value: 'OTHER', label: 'Other' },
];

export default function CategoryFilter({ selectedCategory, onCategoryChange }) {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  useEffect(() => {
    api.get('/events/meta/categories')
      .then((res) => {
        setCategories([{ value: 'ALL', label: 'All Events' }, ...res.data]);
      })
      .catch(() => {
        setCategories(DEFAULT_CATEGORIES);
      });
  }, []);

  return (
    <div className="scrollbar-hide w-full overflow-x-auto pb-2">
      <div className="flex min-w-max gap-2">
        {categories.map((cat) => {
          const selected = selectedCategory === cat.value;

          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => onCategoryChange(cat.value)}
              className={`rounded-full border px-4 py-2 text-sm font-bold transition-all active:translate-y-px ${
                selected
                  ? 'border-[#E23744] bg-[#E23744] text-white shadow-lg shadow-[#E23744]/20'
                  : 'border-white/10 bg-white/[0.04] text-[#d9d0c6] hover:border-white/20 hover:bg-white/[0.08]'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

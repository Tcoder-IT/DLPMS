// Language switcher — per PDF §4.9.5: "The language switcher component provides
// immediate language switching between Amharic and English without page reload".
// Uses i18next's changeLanguage, which immediately re-renders all
// useTranslation()-subscribed components.

import { useTranslation } from 'react-i18next';
import { AVAILABLE_LANGUAGES } from '../i18n/index.js';
import { clsx } from 'clsx';

export default function LanguageSwitcher({ className }) {
  const { i18n } = useTranslation();
  return (
    <div className={clsx('inline-flex rounded-md border border-slate-200 bg-white text-xs', className)}>
      {AVAILABLE_LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => i18n.changeLanguage(lang.code)}
          className={clsx(
            'px-2.5 py-1 font-medium transition-colors',
            i18n.language === lang.code ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'
          )}
          aria-pressed={i18n.language === lang.code}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}

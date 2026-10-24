// i18n setup for the citizen PWA. Per PDF NFR-11 + §4.9.5:
//   "The dual-language support for Amharic and English is implemented
//    through an internationalization (i18n) framework that stores all UI
//    strings in external resource bundles, allowing language switching
//    without page reload."
//
// i18next + react-i18next is the canonical React i18n stack. The
// LanguageSwitcher component in Layout.jsx calls i18n.changeLanguage('am'|'en')
// which immediately re-renders all useTranslation()-subscribed components
// without a page reload, satisfying the PDF requirement.
//
// The default language is read from localStorage on startup. On successful
// login, AuthContext sets the language from user.preferredLanguage.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import am from './locales/am.json';

const STORAGE_KEY = 'dlpms.staff.locale';

function getInitialLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'am') return stored;
  // Default to English; the AuthContext will sync from the user's
  // preferredLanguage after login if the citizen set Amharic.
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    am: { translation: am }
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    // React already escapes by default; no need for i18next to escape too.
    escapeValue: false
  }
});

// Persist language changes so they survive reload.
const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = (lng, callback) => {
  const result = originalChangeLanguage(lng, callback);
  if (lng === 'en' || lng === 'am') {
    localStorage.setItem(STORAGE_KEY, lng);
    // Update <html lang="..."> for accessibility (screen readers).
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lng;
    }
  }
  return result;
};

// Set initial <html lang="..."> for accessibility.
if (typeof document !== 'undefined') {
  document.documentElement.lang = getInitialLanguage();
}

export const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'አማርኛ' }
];

export default i18n;

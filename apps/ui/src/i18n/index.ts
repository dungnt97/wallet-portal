// i18next configuration — English + Vietnamese, synced with Zustand tweaks store.
// Default lang comes from tweaks-store (persisted under wp-tweaks).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { subscribeLang, useTweaksStore } from '@/stores/tweaks-store';
import en from './locales/en.json';
import vi from './locales/vi.json';

// Read initial lang from the persisted store (falls back to default 'vi').
const initialLang = useTweaksStore.getState().lang;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    vi: { translation: vi },
  },
  lng: initialLang,
  fallbackLng: 'en',
  supportedLngs: ['en', 'vi'],
  interpolation: {
    escapeValue: false, // React handles XSS
  },
});

// Keep i18next in sync with Zustand store changes + rehydration events.
subscribeLang((lang) => {
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
});

export default i18n;

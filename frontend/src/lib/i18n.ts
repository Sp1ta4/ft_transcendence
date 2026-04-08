import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enCommon from '@/locales/en/common.json'
import enAuth from '@/locales/en/auth.json'
import enNav from '@/locales/en/nav.json'
import enProfile from '@/locales/en/profile.json'
import enFriends from '@/locales/en/friends.json'

import ruCommon from '@/locales/ru/common.json'
import ruAuth from '@/locales/ru/auth.json'
import ruNav from '@/locales/ru/nav.json'
import ruProfile from '@/locales/ru/profile.json'
import ruFriends from '@/locales/ru/friends.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        auth: enAuth,
        nav: enNav,
        profile: enProfile,
        friends: enFriends,
      },
      ru: {
        common: ruCommon,
        auth: ruAuth,
        nav: ruNav,
        profile: ruProfile,
        friends: ruFriends,
      },
    },
    lng: localStorage.getItem('lang') ?? 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n

import enMessages from './messages/en.json'
import { I18n, i18n, registerLocaleMessages, t, formatCurrency } from './index'

describe('I18n utilities', () => {
  it('interpolates params inside translations', () => {
    const testMessages = {
      ...enMessages,
      billing: {
        ...enMessages.billing,
        title: 'Billing for {tenant}',
      },
    }
    const scoped = new I18n('en', { en: testMessages })

    expect(scoped.t('billing.title', { tenant: 'Acme' })).toBe('Billing for Acme')
  })

  it('warns once for missing translations and allows fallbacks', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const scoped = new I18n()

    expect(scoped.t('unknown.key', undefined, { fallback: 'Fallback text' })).toBe('Fallback text')
    scoped.t('unknown.key')

    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('registers additional locales and swaps at runtime', () => {
    const frMessages = {
      ...enMessages,
      billing: {
        ...enMessages.billing,
        title: 'Facturation',
      },
    }

    registerLocaleMessages('fr', frMessages)
    i18n.setLocale('fr')
    expect(t('billing.title')).toBe('Facturation')

    i18n.setLocale('en')
  })

  it('formats currency with and without minor units', () => {
    const scoped = new I18n()
    expect(scoped.formatCurrency(1234)).toContain('1,234')
    expect(scoped.formatCurrency(1234, 'USD', { fromMinorUnits: true })).toContain('12.34')
  })

  it('exposes helper functions for consumers', () => {
    expect(t('billing.title')).toBe('Billing')
    expect(formatCurrency(99.99)).toContain('99.99')
    expect(formatCurrency(2999, 'USD', { fromMinorUnits: true })).toContain('29.99')
  })
})

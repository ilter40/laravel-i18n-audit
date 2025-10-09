/**
 * Test fixture for Laravel 12 + React 19 + Inertia 2 patterns
 * This file tests all critical translation patterns that were fixed
 */

import { usePage } from '@inertiajs/react';

export default function TestComponent() {
  // Pattern #2: Inertia usePage().props.__()
  const { __ } = usePage().props;

  return (
    <div>
      {/* Pattern #1: React JSX with {__('key')} - CRITICAL FIX */}
      <h1>{__('Welcome back')}</h1>
      <p>{__('You have :count messages')}</p>
      <span>{__('auth.failed')}</span>

      {/* Pattern #1: React JSX with {t('key')} */}
      <div>{t('validation.required')}</div>

      {/* Pattern #3: JSON sentence keys - CRITICAL FIX */}
      <h2>{__('Hello, :name!')}</h2>
      <p>{__('Your account has been created')}</p>
      <small>{__('Last login: :date at :time')}</small>

      {/* Dot notation keys (standard) */}
      <button>{__('buttons.submit')}</button>
      <a href="#">{__('links.learn_more')}</a>

      {/* Pattern #2: Direct page.props usage */}
      <footer>{page.props.__('footer.copyright')}</footer>

      {/* Mixed patterns */}
      <div>
        {__('Profile')}
        {t('Settings')}
        {__('user.profile.title')}
      </div>

      {/* Dynamic keys - should be detected as warnings */}
      <div>{__(`errors.${errorType}`)}</div>
      <div>{__('messages.' + messageKey)}</div>
    </div>
  );
}

// Functional component with inline usePage
export const InlineComponent = () => {
  return (
    <div>
      {usePage().props.__('Inline usage')}
      {usePage().props.__('Another sentence key')}
    </div>
  );
};

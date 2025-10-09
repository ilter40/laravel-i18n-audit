// Test file to verify all v3.1.4 fixes
import { usePage } from '@inertiajs/react';

export default function Test() {
  const { __ } = usePage().props;

  return (
    <div>
      {/* Basic patterns - should work */}
      {__('Welcome')}
      {__('auth.failed')}

      {/* JSON sentences - should work */}
      {__('You have :count messages')}

      {/* FIX #3: Dollar signs - SHOULD NOW WORK */}
      {__('Price: $99')}
      {__('Balance: $1,000')}
      {__('Total: $1,234.56')}
      {__('Discount: $5 off')}

      {/* PHP variables - should still be rejected */}
      {/* __('User $username') */}
      {/* __('Welcome $user') */}
    </div>
  );
}

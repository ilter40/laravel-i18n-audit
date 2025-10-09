{{-- Test fixture for Blade template patterns --}}

<!DOCTYPE html>
<html>
<head>
    <title>@lang('page.title')</title>
</head>
<body>
    {{-- Standard Blade translations --}}
    <h1>@lang('Welcome to our site')</h1>
    <p>{{ __('Thank you for visiting') }}</p>
    <span>{{ __('auth.login') }}</span>

    {{-- Pattern #4: @choice() - CRITICAL FIX --}}
    <div>
        @choice('You have one message|You have :count messages', $messageCount)
        @choice('plurals.items', $itemCount)
        @choice('There are no items|There is one item|There are :count items', $total)
    </div>

    {{-- trans_choice() function --}}
    <p>{{ trans_choice('notifications.unread', $unreadCount) }}</p>
    <p>{{ trans_choice('One apple|:count apples', $apples) }}</p>

    {{-- JSON sentence keys in Blade --}}
    <div>
        {{ __('Your order has been placed') }}
        {{ __('Order #:id is being processed') }}
        {{ __('Estimated delivery: :date') }}
    </div>

    {{-- Mixed dot notation and sentences --}}
    <footer>
        {{ __('footer.copyright') }}
        {{ __('All rights reserved') }}
        {{ __('footer.privacy_policy') }}
    </footer>

    {{-- Dynamic keys (should be detected as warnings) --}}
    <div>{{ __("errors.{$type}") }}</div>
    <div>{{ __('status.' . $current) }}</div>
</body>
</html>

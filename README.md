# Laravel i18n Audit

> Enterprise-grade translation checker for Laravel + Inertia.js projects

[![npm version](https://img.shields.io/npm/v/laravel-i18n-audit.svg)](https://www.npmjs.com/package/laravel-i18n-audit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Find missing translations, validate parameters, check pluralization, and detect duplicates across all your locales.

## ✨ Why Use This?

- ✅ **Finds missing translations** across all locales instantly
- ✅ **Detects multiline calls** - no more missed translations
- ✅ **Validates parameters** - ensures `:name` placeholders match
- ✅ **Checks pluralization** - verifies plural forms are correct
- ✅ **Supports all formats** - JSON, PHP arrays, old `array()` syntax
- ✅ **Works with Laravel 12 + React 19 + Inertia 2** - production tested
- ✅ **Zero dependencies** - pure Node.js implementation
- ✅ **CI/CD ready** - perfect for automated checks

## 🚀 Quick Start

```bash
# Run in your Laravel project
npx laravel-i18n-audit

# Or install globally
npm install -g laravel-i18n-audit
laravel-i18n-audit
```

**That's it!** The tool will scan your code, check translations, and show you what's missing.

## 📊 Example Output

```bash
╔════════════════════════════════════════╗
║  i18n Translation Checker v3.2.2 🌍    ║
╚════════════════════════════════════════╝

📊 SCAN RESULTS
  Source: ./
  Locales: en, ar
  Files scanned: 245
  Translation keys used: 321
  Coverage: 100%
  Duration: 0.37s

✅ No missing translations
✅ Parity OK (base: en)
✅ No duplicate keys
✅ Parameter consistency OK
✅ Pluralization consistency OK

✨ All checks passed! Your i18n is in great shape.
```

## 🎯 Core Features

### 1. Missing Translation Detection

Finds all translation keys in your code and checks if they exist in all languages:

```bash
laravel-i18n-audit --locales en,ar,es
```

### 2. Multiline Support

Detects translations spanning up to 3 lines (since v3.2.0):

```tsx
// ✅ All of these are detected!
__('auth.failed')

__(
  'users.create')

__(
  'products.delete'
)

{t(
  'dashboard.welcome')}
```

### 3. Parameter Validation

Ensures translation parameters match across all languages:

```bash
laravel-i18n-audit --check-params
```

```json
// ❌ Will catch this error:
{
  "en": "Hello :name, you have :count messages",
  "ar": "مرحبا :username"  // Missing :count, wrong :name!
}
```

### 4. Pluralization Validation

Verifies plural forms are consistent:

```bash
laravel-i18n-audit --check-plurals
```

### 5. Duplicate Detection

Finds duplicate keys across and within files:

```bash
laravel-i18n-audit --check-file-duplicates
```

### 6. Smart Caching

Uses file modification tracking for blazing-fast repeat checks:

```bash
laravel-i18n-audit --cache
```

## 📁 Supported Translation Formats

### 1. JSON Files (`lang/en.json`)
```json
{
  "Welcome back": "Welcome back",
  "You have :count messages": "You have :count messages"
}
```

### 2. PHP Subdirectories (`lang/en/auth.php`)
```php
return [
    'failed' => 'These credentials do not match.',
    'nested' => [
        'deep' => 'value'
    ]
];
```

### 3. Single PHP File (`lang/en.php`)
```php
return [
    'welcome' => 'Welcome!',
    'auth.failed' => 'Login failed'
];
```

### 4. Old Array Syntax (since v3.2.2)
```php
return array(
    'key' => array(
        'nested' => 'value'
    )
);
```

## 🔍 Supported Code Patterns

### PHP & Blade
```php
__('auth.failed')
@lang('Welcome back')
@choice('You have one item|You have :count items', $count)
trans_choice('messages.count', 5)
trans('validation.required')        // ✅ Legacy helper (v3.2.5+)
Lang::get('users.welcome')         // ✅ Facade call (v3.2.5+)
```

**Note**: Translation calls in comments are automatically ignored to prevent false positives (v3.2.5+).

### React with Inertia
```tsx
import { usePage } from '@inertiajs/react';

function MyComponent() {
  const { __ } = usePage().props;

  return (
    <div>
      <h1>{__('Welcome back')}</h1>
      <p>{__('auth.failed')}</p>
      <button>{t('buttons.save')}</button>
    </div>
  );
}
```

### Vue with Inertia
```vue
<template>
  <h1>{{ __('Welcome back') }}</h1>
  <p>{{ t('auth.login') }}</p>
</template>
```

### Custom Hooks
Automatically detects custom translation hooks:
```tsx
const { t } = useTranslation();  // ✅ Detected
```

## ⚙️ Configuration

Create `.i18nrc.json` in your project root:

```json
{
  "locales": ["en", "ar", "es"],
  "extensions": ["php", "blade.php", "tsx", "jsx"],
  "checkParams": true,
  "checkPlurals": true,
  "checkFileDuplicates": true,
  "respectGitignore": false,
  "cache": true
}
```

<details>
<summary><b>All configuration options</b></summary>

```json
{
  "src": "./",
  "lang": "resources/lang",
  "locales": ["en", "ar"],
  "extensions": ["php", "blade.php", "ts", "tsx", "js", "jsx", "vue"],

  "showOrphans": false,
  "failOnOrphans": false,
  "showDuplicates": true,
  "checkParams": true,
  "checkPlurals": true,
  "checkFileDuplicates": true,
  "respectGitignore": false,

  "cache": false,
  "verbose": false,
  "json": false
}
```

</details>

## 🖥️ CLI Options

### Common Options
```bash
--locales <list>          Languages to check (default: en,ar)
--src <path>              Directory to scan (default: ./)
--lang <path>             Translations directory (default: resources/lang)
--ext <list>              File extensions to scan

--check-params            Validate translation parameters
--check-plurals           Validate pluralization rules
--check-file-duplicates   Check for duplicates within files
--respect-gitignore       Skip files in .gitignore

--cache                   Use caching for speed
--verbose                 Show detailed output
--json                    Output as JSON for CI/CD
```

### Full Options List
```bash
laravel-i18n-audit --help
```

## 🔧 CI/CD Integration

### GitHub Actions

```yaml
name: Check Translations

on: [push, pull_request]

jobs:
  i18n:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
      - name: Check translations
        run: |
          npx laravel-i18n-audit \
            --check-params \
            --check-plurals \
            --json
```

### Exit Codes

Perfect for CI/CD pipelines - codes combine using bitwise OR:

| Code | Meaning |
|------|---------|
| `0` | ✅ All checks passed |
| `1` | Missing translations |
| `2` | Language parity issues |
| `4` | Duplicate keys (across files) |
| `8` | Parameter mismatches |
| `16` | Orphaned translations (when `--fail-on-orphans`) |
| `32` | Pluralization issues |
| `64` | Duplicate keys (within same file) |

**Example**: Exit code `9` = Missing translations (1) + Parameter mismatches (8)

## 💡 Usage Examples

### Laravel + React + Inertia
```bash
laravel-i18n-audit \
  --src ./resources/js \
  --locales en,ar,es \
  --ext tsx,jsx,php \
  --check-params \
  --cache
```

### Full Audit with All Checks
```bash
laravel-i18n-audit \
  --check-params \
  --check-plurals \
  --check-file-duplicates \
  --show-orphans \
  --verbose
```

### JSON-only Project (No PHP)
```bash
laravel-i18n-audit \
  --src ./src \
  --lang ./locales \
  --locales en,fr \
  --ext ts,tsx
```

### Vue Project
```bash
laravel-i18n-audit \
  --src ./src \
  --lang ./locales \
  --locales en,fr,de \
  --ext vue,js,ts
```

### Fast CI Check
```bash
laravel-i18n-audit \
  --cache \
  --json \
  --check-params
```

## 🎯 Advanced Features

<details>
<summary><b>Find Unused Translations</b></summary>

Find "orphan" translations defined but never used:

```bash
laravel-i18n-audit --show-orphans
```

Output:
```
👻 ORPHAN KEYS: 12
  (Defined in lang files but not used in code)
  • old.unused.key
  • deprecated.message
  ...
```

</details>

<details>
<summary><b>Respect .gitignore</b></summary>

Skip files/directories listed in `.gitignore`:

```bash
laravel-i18n-audit --respect-gitignore
```

Or in config:
```json
{
  "respectGitignore": true
}
```

</details>

<details>
<summary><b>JSON Output for Parsing</b></summary>

Perfect for custom CI/CD scripts:

```bash
laravel-i18n-audit --json > report.json
```

Output structure:
```json
{
  "success": false,
  "exitCode": 1,
  "stats": {
    "filesScanned": 245,
    "translationKeysUsed": 321,
    "coverage": 87
  },
  "issues": {
    "missingTranslations": { "ar": ["auth.failed"] }
  }
}
```

</details>

## 🔥 What's New

### v3.2.5 - Enhanced Pattern Detection
- ✅ Added `trans()` helper detection (legacy Laravel facade)
- ✅ Added `Lang::get()` facade call detection
- ✅ Fixed comment false positives (no longer detects keys in // or /* */ comments)
- ✅ Improved detection accuracy across PHP, JavaScript, and TypeScript

### v3.2.2 - PHP Parser Improvements
- ✅ Old `array()` syntax support
- ✅ Proper bracket counting (not just indentation)
- ✅ Handles single-line arrays correctly

### v3.2.0 - Multiline Support
- ✅ Detects translation calls spanning up to 3 lines
- ✅ Sliding window algorithm for accurate detection
- ✅ Works with all patterns (`__()`, `t()`, JSX, etc.)

### v3.1.6 - .gitignore Support
- ✅ Respects project .gitignore patterns
- ✅ Reduces false positives from build artifacts

[See full changelog →](CHANGELOG.md)

## 📋 Requirements

- **Node.js** 18 or higher
- **PHP** 7.4 or higher (only if you use PHP translation files)

## ⚠️ Known Limitations

- **Dynamic keys**: Keys built at runtime can't be validated (e.g., `__(\`errors.\${type}\`)`)
- **Template literals**: JavaScript template strings with variables aren't supported
- **Very long multiline calls**: Calls spanning 4+ lines won't be detected (rare in practice)

## 🐛 Troubleshooting

<details>
<summary><b>Translations not found</b></summary>

1. Verify `lang` directory path: `--lang resources/lang`
2. Check file naming: `en.json`, `en.php`, or `en/auth.php`
3. Use `--verbose` to see what's being scanned
4. Ensure PHP is installed if using `.php` translation files

</details>

<details>
<summary><b>False positives from build files</b></summary>

Use `--respect-gitignore` or add to `.gitignore`:
```gitignore
build/
dist/
public/build/
.next/
out/
```

These directories are already ignored by default:
- `node_modules`, `vendor`, `.git`
- `public`, `build`, `dist`, `.next`, `out`
- `tests`, `docs`, `storage`

</details>

<details>
<summary><b>Performance is slow</b></summary>

1. Enable caching: `--cache`
2. Limit file extensions: `--ext tsx,jsx,php`
3. Use `--respect-gitignore` to skip unnecessary files
4. Scan specific directory: `--src ./resources/js`

</details>

## 📚 Resources

- 📖 [Full Documentation](https://github.com/Saleh7/laravel-i18n-audit)
- 🐛 [Report Issues](https://github.com/Saleh7/laravel-i18n-audit/issues)
- 💬 [Discussions](https://github.com/Saleh7/laravel-i18n-audit/discussions)
- 🤝 [Contributing Guide](CONTRIBUTING.md)

## 🙏 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 👤 Author

**Saleh** - [Saleh7@protonmail.ch](mailto:Saleh7@protonmail.ch)

---

<div align="center">

**Made with ❤️ for Laravel and Inertia.js developers**

⭐ Star this repo if it helps your project!

</div>

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
- ✅ **Ignores framework keys** - eliminate false positives from Laravel's dynamic translations ⭐ NEW
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

  "ignoreKeys": [],
  "ignorePatterns": [],
  "ignoreDomains": [],

  "cache": false,
  "verbose": false,
  "json": false
}
```

**Ignore options** (v3.3.0+):
- `ignoreKeys`: Array of exact translation keys to ignore in orphan detection
- `ignorePatterns`: Array of regex patterns to match keys to ignore
- `ignoreDomains`: Array of domain prefixes (e.g., `["passwords"]` ignores all `passwords.*` keys)

</details>

## 🖥️ CLI Options

### Common Options
```bash
--config <path>           Load config from file
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
<summary><b>Ignore Framework Keys</b> ⭐ NEW in v3.3.0</summary>

Laravel's framework uses dynamic translation keys that appear as "orphans" in static analysis. Use ignore features to eliminate false positives:

### Option 1: Ignore by Domain (Simplest)

Ignore entire translation namespaces:

```json
{
  "showOrphans": true,
  "ignoreDomains": ["passwords", "auth", "pagination"]
}
```

This ignores:
- `passwords.*` → `passwords.reset`, `passwords.user`, `passwords.token`, etc.
- `auth.*` → `auth.failed`, `auth.throttle`, etc.
- `pagination.*` → `pagination.previous`, `pagination.next`, etc.

### Option 2: Ignore Exact Keys

Specify individual keys to ignore:

```json
{
  "showOrphans": true,
  "ignoreKeys": [
    "passwords.reset",
    "passwords.throttled",
    "passwords.token",
    "passwords.user"
  ]
}
```

### Option 3: Ignore by Pattern (Advanced)

Use regex patterns for fine-grained control:

```json
{
  "showOrphans": true,
  "ignorePatterns": [
    "^passwords\\.",
    "^auth\\.(failed|throttle)$",
    "^validation\\.custom\\."
  ]
}
```

### Example Configuration

```json
{
  "src": "./app",
  "lang": "./resources/lang",
  "locales": ["en", "ar"],
  "showOrphans": true,
  "ignoreDomains": ["passwords", "auth", "pagination"],
  "cache": true
}
```

**Why these keys appear as orphans:**

Laravel's Password Broker returns status constants like `'passwords.reset'` which are then passed to `__($status)`. Static analysis can't detect this dynamic usage.

See [ORPHAN_KEYS_ANALYSIS_REPORT.md](./ORPHAN_KEYS_ANALYSIS_REPORT.md) for detailed explanation.

</details>

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

**Tip:** Use `ignoreDomains` to filter out framework keys (see above).

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



## 🙏 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

<div align="center">⭐ Star this repo if it helps your project!</div>

# Contributing to Laravel i18n Audit

Thank you for considering contributing to this project! 🎉

## How to Contribute

### Reporting Bugs

If you find a bug, please [open an issue](https://github.com/Saleh7/laravel-i18n-audit/issues/new) with:

- **Clear title** - Brief description of the problem
- **Steps to reproduce** - How to trigger the bug
- **Expected behavior** - What should happen
- **Actual behavior** - What actually happens
- **Environment** - Node version, PHP version, OS
- **Example** - Sample code or project if possible

### Suggesting Features

Have an idea? [Open an issue](https://github.com/Saleh7/laravel-i18n-audit/issues/new) with:

- **Use case** - Why is this feature needed?
- **Proposed solution** - How should it work?
- **Alternatives** - Other ways to solve the problem

### Pull Requests

1. **Fork** the repository
2. **Create a branch** - `git checkout -b feature/my-feature`
3. **Make your changes**
4. **Test** - Make sure everything still works
5. **Commit** - Use clear commit messages
6. **Push** - Push to your fork
7. **Open a PR** - Describe what you changed and why

#### Pull Request Guidelines

- ✅ Keep changes focused on one thing
- ✅ Write clear commit messages
- ✅ Test your changes
- ✅ Update documentation if needed
- ✅ Follow the existing code style

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/laravel-i18n-audit.git
cd laravel-i18n-audit

# Make changes
# Test locally
node index.js --help
node index.js --src ./tests/fixtures

# Test on a real project
npm link
cd /path/to/laravel/project
laravel-i18n-audit
```

## Code Style

- Use clear, descriptive variable names
- Add comments for complex logic
- Keep functions focused and small
- Use JSDoc comments for functions

## Project Structure

```
laravel-i18n-audit/
├── index.js        - Main CLI and orchestration
├── loaders.js      - Load translation files
├── scanner.js      - Scan source code for keys
├── validators.js   - Validation logic
└── tests/          - Test fixtures
```

## Testing

Before submitting a PR:

```bash
# Test help output
node index.js --help

# Test on fixtures
node index.js --src ./tests/fixtures --lang ./tests/fixtures/lang

# Test all flags
node index.js --check-params --check-plurals --verbose
```

## Questions?

- 💬 [Start a discussion](https://github.com/Saleh7/laravel-i18n-audit/discussions)
- 📧 Email: Saleh7@protonmail.ch

## Code of Conduct

Be nice and respectful. That's it! 😊

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

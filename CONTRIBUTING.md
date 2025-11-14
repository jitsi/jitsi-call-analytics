# Contributing to Jitsi Call Analytics

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

### Prerequisites

- Node.js 20.x or later
- npm 10.x or later
- Git
- (Optional) Docker for containerized development

### Development Setup

1. **Fork and clone the repository:**

```bash
git clone https://github.com/your-username/jitsi-call-analytics.git
cd jitsi-call-analytics
```

2. **Install dependencies:**

```bash
npm install
```

3. **Configure environment variables:**

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your configuration

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your configuration
```

4. **Start development servers:**

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm start
```

5. **Verify setup:**

- Backend: http://localhost:5000/health
- Frontend: http://localhost:3000

## Development Workflow

### Branch Strategy

- `master` - Main branch, always stable
- `feature/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/description` - Documentation updates

### Making Changes

1. **Create a new branch:**

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes following our coding standards**

3. **Test your changes:**

```bash
# Run linter
npm run lint

# Run tests
npm test

# Test manually
```

4. **Commit your changes:**

```bash
git add .
git commit -m "feat: add new feature description"
```

### Commit Message Convention

We follow Conventional Commits:

```
type(scope): subject

body

footer
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(frontend): add environment selector to RTCStats search
fix(backend): resolve IAM credential caching issue
docs(readme): update deployment instructions
refactor(services): extract common S3 download logic
test(dump-processor): add tests for participant merging
chore(deps): update @jitsi/logger to v2.0.0
```

### Opening a Pull Request

1. **Push your branch:**

```bash
git push origin feature/your-feature-name
```

2. **Open a PR on GitHub:**

- Fill out the PR template completely
- Link related issues
- Request review from maintainers
- Ensure CI checks pass

3. **Address review feedback:**

- Make requested changes
- Push updates to the same branch
- Respond to comments

4. **After approval:**

- PR will be merged by maintainers
- Your branch will be automatically deleted

## Coding Standards

### General Guidelines

- **Follow ESLint rules** (`@jitsi/eslint-config`)
- **4-space indentation** consistently
- **JSDoc comments** for all public functions and classes
- **TypeScript** for type safety
- **No emojis** in code, comments, or logs

### Backend

- Use `@jitsi/logger` for all logging (never `console.log`)
- Use `logger.debug()` for frequent operations
- Use `logger.info()` for important one-time events
- Structured logging with context objects
- Environment variables for configuration
- IAM authentication preferred over static credentials

**Example:**

```typescript
import { getLogger } from '@jitsi/logger';

const logger = getLogger('backend/src/services/MyService');

export class MyService {
    /**
     * Fetches data from the API.
     *
     * @param {string} id - The resource ID
     * @returns {Promise<Data>} The fetched data
     */
    async fetchData(id: string): Promise<Data> {
        logger.debug('Fetching data', { id });

        try {
            const result = await api.get(`/data/${id}`);

            logger.debug('Data fetched successfully', { id, size: result.length });

            return result;
        } catch (error) {
            logger.error('Failed to fetch data', { id, error });
            throw error;
        }
    }
}
```

### Frontend

- Use Material-UI components consistently
- Use `@jitsi/logger` for logging
- TypeScript for all components
- Functional components with hooks
- Explicit prop types interfaces

**Example:**

```typescript
import { getLogger } from '@jitsi/logger';
import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';

const logger = getLogger('frontend/src/components/MyComponent');

interface MyComponentProps {
    userId: string;
    onLoad?: (data: UserData) => void;
}

const MyComponent: React.FC<MyComponentProps> = ({ userId, onLoad }) => {
    const [data, setData] = useState<UserData | null>(null);

    useEffect(() => {
        logger.debug('Loading user data', { userId });
        fetchUserData(userId);
    }, [userId]);

    // Component implementation...
};

export default MyComponent;
```

### Testing

- Write tests for new features
- Update tests when changing existing code
- Aim for >80% code coverage
- Test edge cases and error conditions

**Test Structure:**

```typescript
describe('MyService', () => {
    describe('fetchData', () => {
        it('should fetch data successfully', async () => {
            // Arrange
            const service = new MyService();
            const mockId = 'test-id';

            // Act
            const result = await service.fetchData(mockId);

            // Assert
            expect(result).toBeDefined();
            expect(result.id).toBe(mockId);
        });

        it('should handle errors gracefully', async () => {
            // Test error handling
        });
    });
});
```

## Documentation

- Update README.md for user-facing changes
- Update CLAUDE.md for development guidelines
- Update API documentation for endpoint changes
- Add JSDoc comments for new functions
- Update CHANGELOG.md for releases

## Security

### Never Commit Secrets

- AWS credentials
- API keys
- Database passwords
- Private keys

Use `.env` files (gitignored) for local development and GitHub Secrets for CI/CD.

### Security Checklist

- [ ] No hardcoded credentials
- [ ] Input validation for user data
- [ ] SQL injection prevention
- [ ] XSS prevention in frontend
- [ ] CORS properly configured
- [ ] Dependencies scanned for vulnerabilities

If you discover a security vulnerability, please report it privately (see SECURITY.md).

## Review Process

### What Reviewers Look For

- Code quality and style compliance
- Test coverage
- Documentation completeness
- Security considerations
- Performance implications
- Breaking changes properly documented

### Review Timeline

- Initial review: Within 3 business days
- Follow-up reviews: Within 2 business days
- Merge after approval: 24 hours (for feedback)

## Release Process

(For maintainers)

1. Update CHANGELOG.md
2. Update version in package.json
3. Create git tag: `git tag v1.0.0`
4. Push tag: `git push origin v1.0.0`
5. Create GitHub release
6. Build and publish Docker images

## Getting Help

- **Documentation**: Check README.md, CLAUDE.md, and DOCKER.md
- **Issues**: Search existing issues before opening new ones
- **Questions**: Open a GitHub discussion or issue with the "question" label
- **Chat**: (Add your chat/Slack link if available)

## Recognition

Contributors will be recognized in:
- GitHub contributors list
- CHANGELOG.md for releases
- Release notes

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

## Thank You!

Your contributions make this project better for everyone. We appreciate your time and effort!

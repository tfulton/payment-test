# payment-test

TypeScript monorepo for payment integration experiments.

## Packages

- `common`: shared library
- `auth`: authentication library; depends on `common`
- `payment`: payment library; depends on `common`
- `payment-ui`: Next.js payment interface; depends on `common`, `auth`, and `payment`

## Commands

```sh
npm install
npm run check
npm run build
```

## Configuration

Environment configuration lives at the repository root. Copy `.env.example` to
`.env.local` and keep local values or secrets in the ignored `.env.local` file.

The payment UI reads validated server-side settings through
`payment-ui/config/env.ts`.

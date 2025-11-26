# consensus-engine

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Ontology Embeddings

This project uses an ontology classification service to categorize topics and arguments. To improve efficiency, embeddings are pre-computed rather than generated at runtime.

### Generating Embeddings

When the ontology categories change (in `ontology_categories.json`), you must regenerate the embeddings:

```bash
npm run generate-embeddings
```

This will:
1. Read categories from `ontology_categories.json`
2. Generate embeddings using the OpenAI API
3. Save the embeddings to `ontology_embeddings.json`

**Note:** You need to set `OPENAI_API_KEY` in your `.env` file to run this script.

### How It Works

- The `ontologyClassificationService` first tries to load pre-computed embeddings from `ontology_embeddings.json`
- If the file doesn't exist or is invalid, it falls back to generating embeddings at runtime
- The pre-computed embeddings file should be committed to the repository
- This approach significantly reduces API calls and improves server startup time

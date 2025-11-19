# Ontology Embeddings Generation

## Overview

This document describes the ontology embeddings system and how to maintain it.

## Problem Solved

Previously, the system called the OpenAI API to generate embeddings for all ~1,700 categories on every server deployment. This was:
- **Slow**: Added significant startup time
- **Expensive**: Unnecessary API calls on every deployment
- **Inefficient**: Categories rarely change, so embeddings shouldn't need regeneration

## Solution

Embeddings are now **pre-computed** and stored in a file:
- Generation is done once using a standalone script
- The server loads pre-computed embeddings from `ontology_embeddings.json`
- Falls back to runtime generation only if the file is missing

## When to Regenerate Embeddings

You must regenerate embeddings when:

1. **Categories are added, removed, or modified** in `ontology_categories.json`
2. **The embedding model changes** (e.g., upgrading from `text-embedding-3-small` to `text-embedding-3-large`)
3. **Category descriptions or synonyms change**

You do NOT need to regenerate embeddings when:
- Changing application code
- Modifying classification logic
- Updating other files

## How to Regenerate Embeddings

### Prerequisites

1. Set your OpenAI API key in `.env`:
   ```bash
   OPENAI_API_KEY=sk-...
   ```

2. (Optional) Set a custom embedding model:
   ```bash
   OPENAI_EMBED_MODEL=text-embedding-3-large
   ```

### Run the Script

```bash
npm run generate-embeddings
```

### What Happens

1. The script reads `ontology_categories.json`
2. Generates embeddings using the OpenAI API (in batches of 128)
3. Normalizes the vectors for cosine similarity
4. Saves results to `ontology_embeddings.json`
5. Reports file size and completion

### Expected Output

```
🔄 Loading ontology categories...
✅ Loaded 1700 categories
🔄 Building search texts...
🔄 Generating embeddings using model: text-embedding-3-large...
   Processing 128/1700...
   Processing 256/1700...
   ...
   Processing 1700/1700...
🔄 Normalizing embeddings...
🔄 Preparing output data...
🔄 Writing embeddings to /path/to/ontology_embeddings.json...
✅ Successfully generated embeddings for 1700 categories
✅ Output saved to: /path/to/ontology_embeddings.json
📊 File size: 15.23 MB
```

## File Structure

### ontology_embeddings.json

```json
{
  "model": "text-embedding-3-large",
  "generatedAt": "2025-01-19T12:34:56.789Z",
  "categories": [
    {
      "id": "medtop:01000000",
      "label": "arts, culture and entertainment",
      "description": "Matters pertaining to..."
    }
    // ... more categories
  ],
  "embeddings": [
    [0.123, -0.456, 0.789, ...],  // 3072 dimensions for text-embedding-3-large
    // ... one embedding per category
  ]
}
```

## How the System Uses Embeddings

1. **On Server Startup**:
   - Service tries to load `ontology_embeddings.json`
   - If found and valid, loads embeddings into memory cache
   - If not found, falls back to runtime generation (with warning)

2. **During Classification**:
   - User text is embedded using OpenAI API
   - System computes cosine similarity with all category embeddings
   - Returns top matches based on similarity scores

## Deployment Checklist

When deploying changes to categories:

- Update `ontology_categories.json`
- Run `npm run generate-embeddings` locally
- Verify `ontology_embeddings.json` is created/updated
- Commit both `ontology_categories.json` and `ontology_embeddings.json`
- Deploy to production

## Troubleshooting

### Error: "Missing OPENAI_API_KEY"

Make sure your `.env` file contains a valid OpenAI API key.

### Warning: "Pre-computed embeddings file not found"

The server will generate embeddings at runtime. This is slower but functional.
Run `npm run generate-embeddings` to create the file.

### Warning: "Embeddings were generated with model X, but current model is Y"

The embeddings were created with a different model than currently configured.
For best results, regenerate with: `npm run generate-embeddings`

### Error: "Failed to fetch from OpenAI"

Check:
- API key is valid
- You have sufficient API credits
- Network connectivity

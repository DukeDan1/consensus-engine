/**
 * Next.js Instrumentation Hook
 * 
 * This file is automatically called by Next.js during application startup (both dev and production).
 * It runs once when the server starts, making it ideal for warming up caches and initializing services.
 * 
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server-side (Next.js automatically provides this environment variable)
  if ((process as any).env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Starting server initialization...');
    
    // Warmup ontology classification index in the background
    // This prevents the first API request from blocking while the index is built
    try {
      const { warmupOntologyIndex } = await import('./app/services/ontologyClassificationService');
      
      // Start warmup asynchronously - don't block server startup
      warmupOntologyIndex().catch((error: Error) => {
        console.error('[Instrumentation] Failed to warmup ontology index:', error);
        console.error('[Instrumentation] Index will be built on first use instead');
      });
      
      console.log('[Instrumentation] Ontology index warmup initiated in background');
    } catch (error) {
      console.error('[Instrumentation] Failed to import ontology service:', error);
    }
    
    console.log('[Instrumentation] Server initialization complete');
  }
}

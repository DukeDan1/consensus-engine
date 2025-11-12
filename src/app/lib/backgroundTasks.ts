/**
 * Background task tracking for graceful shutdown handling.
 * Tracks fire-and-forget promises to allow them to complete during shutdown.
 */

const backgroundTasks = new Set<Promise<void>>();

/**
 * Register a background task for tracking.
 * The task will be tracked until it completes or fails.
 */
export function trackBackgroundTask(task: Promise<void>): void {
    backgroundTasks.add(task);
    task
        .catch(() => {
            // Errors are already logged by the task itself
        })
        .finally(() => {
            backgroundTasks.delete(task);
        });
}

/**
 * Wait for all background tasks to complete.
 * Should be called during graceful shutdown.
 */
export async function waitForBackgroundTasks(timeoutMs: number = 30000): Promise<void> {
    if (backgroundTasks.size === 0) {
        return;
    }

    const allTasks = Promise.all(Array.from(backgroundTasks));
    const timeout = new Promise<void>((resolve) => {
        setTimeout(() => resolve(), timeoutMs);
    });

    await Promise.race([allTasks, timeout]);
}

/**
 * Get the current number of pending background tasks.
 */
export function getPendingTaskCount(): number {
    return backgroundTasks.size;
}

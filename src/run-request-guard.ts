/**
 * Tracks, purely in memory, which request IDs have already been resolved (started, retried, or
 * reconnected to) during the current process's lifetime.
 *
 * This state is intentionally never persisted: it must start empty again after every resurrection,
 * so that finding previously tracked Run info for a request ID this process hasn't itself resolved
 * yet is correctly recognized as a legitimate reconnect, rather than an ambiguous duplicate.
 */
export class RunRequestGuard {
    private readonly startedRequestIds = new Set<string>();

    hasStarted(requestId: string): boolean {
        return this.startedRequestIds.has(requestId);
    }

    markStarted(requestId: string): void {
        this.startedRequestIds.add(requestId);
    }
}

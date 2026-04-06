/**
 * Minimal type declarations for google.script.run used in the sidebar.
 */
declare namespace google {
  namespace script {
    interface Runner {
      withSuccessHandler<T>(handler: (result: T) => void): Runner;
      withFailureHandler(handler: (error: Error) => void): Runner;
      getRotationSummary(): void;
      startCycle(config: unknown): void;
      previewEndCycle(tierOrder: string[], promoteCount: number, demoteCount: number, promoteOverrides: Record<string, number>, demoteOverrides: Record<string, number>, matchesPerSet: number): void;
      commitEndCycle(tierOrder: string[], promoteCount: number, demoteCount: number, promoteOverrides: Record<string, number>, demoteOverrides: Record<string, number>, matchesPerSet: number): void;
      activateQueuedPlayers(): void;
      hasRollbackData(): void;
      rollbackEndCycle(): void;
    }
    const run: Runner;
  }
}

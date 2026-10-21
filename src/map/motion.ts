/** Animation length, or none when the user asks the system for reduced motion (WCAG 2.3.3). */
export const duration = (ms: number): number =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : ms;

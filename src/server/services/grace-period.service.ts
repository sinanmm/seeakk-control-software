import { differenceInDays, isAfter, isBefore } from 'date-fns';

export interface GracePeriodEntity {
  id: string;
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  reason: string;
  notes: string | null;
}

export class GracePeriodService {
  /**
   * Evaluates if a company's grace period is actively in effect.
   */
  static isGracePeriodActive(gracePeriod: GracePeriodEntity | null | undefined): boolean {
    if (!gracePeriod || !gracePeriod.isActive) return false;
    const now = new Date();
    return isAfter(now, gracePeriod.startDate) && isBefore(now, gracePeriod.endDate);
  }

  /**
   * Calculates how many full days are left in an active grace period.
   * Returns 0 if expired or not active.
   */
  static getDaysRemaining(gracePeriod: GracePeriodEntity | null | undefined): number {
    if (!gracePeriod || !gracePeriod.isActive) return 0;
    const now = new Date();
    if (isAfter(now, gracePeriod.endDate)) return 0;
    return Math.max(0, differenceInDays(gracePeriod.endDate, now));
  }

  /**
   * Returns human-readable status badge or label for the grace period.
   */
  static getStatusDescription(gracePeriod: GracePeriodEntity | null | undefined): string {
    if (!gracePeriod || !gracePeriod.isActive) {
      return 'No active grace period';
    }
    const days = this.getDaysRemaining(gracePeriod);
    if (days === 0) {
      return 'Grace period expired today';
    }
    return `${days} day${days === 1 ? '' : 's'} remaining`;
  }
}

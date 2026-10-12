export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";
export interface StatusBadgeProps {
    label: string;
    tone?: StatusTone;
    className?: string;
}
export declare function StatusBadge({ label, tone, className }: StatusBadgeProps): any;
//# sourceMappingURL=status-badge.d.ts.map
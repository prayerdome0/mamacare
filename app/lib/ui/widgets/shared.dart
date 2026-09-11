import 'package:flutter/material.dart';

import '../../core/app_theme.dart';

/// Small shared widgets used across the MVP screens.

class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    this.color = AppTheme.primary,
    this.tappable = true,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String value;
  final Color color;
  final bool tappable;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: tappable ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(value,
                        style: const TextStyle(
                            fontSize: 22, fontWeight: FontWeight.w800)),
                    Text(title,
                        style: const TextStyle(
                            fontSize: 13, color: AppTheme.muted)),
                  ],
                ),
              ),
              if (tappable)
                const Icon(Icons.chevron_right, color: AppTheme.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.title,
    required this.child,
    this.trailing,
  });

  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(title.toUpperCase(),
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.1,
                          color: AppTheme.muted)),
                ),
                if (trailing != null) trailing!,
              ],
            ),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

class RiskBadge extends StatelessWidget {
  const RiskBadge({super.key, required this.level, this.label});

  final String level; // red | amber | green
  final String? label;

  @override
  Widget build(BuildContext context) {
    final color = AppTheme.levelColor(level);
    final text = label ??
        (level == 'red'
            ? 'URGENT'
            : level == 'amber'
                ? 'REQUIRES REVIEW'
                : 'STABLE');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(level == 'green' ? Icons.check_circle : Icons.warning_amber,
              size: 16, color: color),
          const SizedBox(width: 6),
          Text(text,
              style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                  letterSpacing: 0.6)),
        ],
      ),
    );
  }
}

/// Large selectable danger-sign button (spec: large tappable checklist).
class DangerSignTile extends StatelessWidget {
  const DangerSignTile({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.exclusive = false,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool exclusive;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? (exclusive ? AppTheme.amber.withValues(alpha: 0.12)
              : AppTheme.red.withValues(alpha: 0.08))
          : Colors.white,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Checkbox(
                value: selected,
                onChanged: (_) => onTap(),
                activeColor: exclusive ? AppTheme.amber : AppTheme.red,
              ),
              Expanded(
                child: Text(label,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight:
                          selected ? FontWeight.w700 : FontWeight.w500,
                    )),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SyncIcon extends StatelessWidget {
  const SyncIcon({super.key, required this.status});

  final String status; // synced | syncing | failed | pending

  @override
  Widget build(BuildContext context) {
    final (icon, color, tip) = switch (status) {
      'synced' => (Icons.check_circle, AppTheme.green, 'Synced'),
      'syncing' => (Icons.sync, AppTheme.primary, 'Syncing'),
      'failed' => (Icons.warning, AppTheme.red, 'Sync failed'),
      _ => (Icons.cloud_upload_outlined, AppTheme.muted, 'Waiting to sync'),
    };
    return Tooltip(message: tip, child: Icon(icon, size: 18, color: color));
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 44, color: AppTheme.muted.withValues(alpha: 0.6)),
            const SizedBox(height: 12),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppTheme.muted)),
          ],
        ),
      ),
    );
  }
}

String fmtDate(DateTime? d) {
  if (d == null) return '—';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  return '${d.day.toString().padLeft(2, '0')} ${months[d.month - 1]} ${d.year}';
}

String fmtDateTime(DateTime? d) {
  if (d == null) return '—';
  return '${fmtDate(d)}, ${d.hour.toString().padLeft(2, '0')}:'
      '${d.minute.toString().padLeft(2, '0')}';
}

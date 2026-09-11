import 'package:uuid/uuid.dart';

import '../../models/alert_rule.dart';
import '../../models/clinical_alert.dart';
import '../../models/vitals.dart';

// Danger-sign checklist keys come from DangerSignKeys (models/danger_sign.dart);
// rules reference them as plain strings so the engine stays decoupled.

/// The clinical alert engine.
///
/// IMPORTANT design constraint: the engine NEVER names a diagnosis.
/// RED  → "Potential danger sign — immediate clinical assessment required."
/// AMBER → "Concerning finding — clinical review and follow-up required."
///
/// Rules are data (see [AlertRule]) — they live in the `alert_rules` table
/// so national-guideline changes do not require an app release. The local
/// cache is refreshed on every sync.
class AlertEngine {
  AlertEngine(this.rules) : _uuid = const Uuid();

  final List<AlertRule> rules;
  final Uuid _uuid;

  /// Evaluates one visit's findings against all enabled rules.
  /// NOTE: callers must de-duplicate per (pregnancy, visit, rule) before
  /// storing — see DataRepository.saveVisit.
  List<ClinicalAlert> evaluate({
    required String pregnancyId,
    String? visitId,
    Vitals? vitals,
    required Set<String> reportedSignKeys,
    double? previousWeightKg,
  }) {
    final ctx = _Context(
      vitals: vitals,
      signs: reportedSignKeys,
      weightLoss: (vitals?.weightKg != null && previousWeightKg != null)
          ? (vitals!.weightKg! < previousWeightKg!)
          : false,
    );

    final fired = <ClinicalAlert>[];
    for (final rule in rules) {
      if (!rule.enabled) continue;
      if (_matches(rule.condition, ctx)) {
        fired.add(ClinicalAlert(
          id: _uuid.v4(),
          pregnancyId: pregnancyId,
          visitId: visitId,
          ruleKey: rule.ruleKey,
          level: rule.level,
          message: rule.message,
        ));
      }
    }
    return fired;
  }

  bool _matches(RuleCondition cond, _Context ctx) {
    final results = cond.criteria.map((c) => _criterionMatches(c, ctx));
    if (results.isEmpty) return false;
    return cond.logic == 'all' ? results.every((r) => r) : results.any((r) => r);
  }

  bool _criterionMatches(RuleCriterion c, _Context ctx) {
    switch (c.field) {
      case 'danger_sign':
        return c.key != null && ctx.signs.contains(c.key);
      case 'systolic_bp':
        return _numOp(ctx.vitals?.systolicBp?.toDouble(), c.op, c.value);
      case 'diastolic_bp':
        return _numOp(ctx.vitals?.diastolicBp?.toDouble(), c.op, c.value);
      case 'pulse':
        return _numOp(ctx.vitals?.pulse?.toDouble(), c.op, c.value);
      case 'temperature_c':
        return _numOp(ctx.vitals?.temperatureC, c.op, c.value);
      case 'respiratory_rate':
        return _numOp(ctx.vitals?.respiratoryRate?.toDouble(), c.op, c.value);
      case 'weight_kg':
        return _numOp(ctx.vitals?.weightKg, c.op, c.value);
      case 'weight_loss':
        if (c.op == 'eq') return ctx.weightLoss == (c.value == true || c.value == 1);
        return false;
      default:
        return false;
    }
  }

  bool _numOp(double? actual, String? op, dynamic value) {
    if (actual == null) return false;
    final target = (value is num) ? value.toDouble() : null;
    if (target == null) return false;
    return switch (op) {
      'eq' => actual == target,
      'ne' => actual != target,
      'gt' => actual > target,
      'gte' => actual >= target,
      'lt' => actual < target,
      'lte' => actual <= target,
      _ => false,
    };
  }
}

class _Context {
  final Vitals? vitals;
  final Set<String> signs;
  final bool weightLoss;

  _Context({this.vitals, required this.signs, required this.weightLoss});
}

/// Built-in default ruleset, used until the first sync downloads the
/// database rules (or if the device has never synced). This must stay in
/// lockstep with the seed in supabase/migrations — both require clinical
/// validation before deployment.
class DefaultAlertRules {
  static final List<AlertRule> all = [
    _r('convulsions', AlertLevel.red, 'Convulsions reported', _sign('convulsions')),
    _r('vaginal_bleeding', AlertLevel.red, 'Vaginal bleeding reported',
        _sign('vaginal_bleeding')),
    _r('reduced_fetal_movement', AlertLevel.red, 'Reduced or absent fetal movement',
        _sign('reduced_fetal_movement')),
    _r('fluid_leakage', AlertLevel.red, 'Fluid leakage reported',
        _sign('fluid_leakage')),
    _r('difficulty_breathing', AlertLevel.red, 'Difficulty breathing reported',
        _sign('difficulty_breathing')),
    _r('severe_pain_and_bleeding', AlertLevel.red,
        'Severe abdominal pain with bleeding',
        const RuleCondition.all([
          RuleCriterion('danger_sign', key: 'severe_abdominal_pain'),
          RuleCriterion('danger_sign', key: 'vaginal_bleeding'),
        ])),
    _r('headache_and_vision', AlertLevel.red,
        'Severe headache with visual disturbance',
        const RuleCondition.all([
          RuleCriterion('danger_sign', key: 'severe_headache'),
          RuleCriterion('danger_sign', key: 'blurred_vision'),
        ])),
    _r('bp_severe', AlertLevel.red, 'Severely raised blood pressure (≥160/110)',
        const RuleCondition.any([
          RuleCriterion('systolic_bp', op: 'gte', value: 160),
          RuleCriterion('diastolic_bp', op: 'gte', value: 110),
        ])),
    _r('severe_abdominal_pain', AlertLevel.amber, 'Severe abdominal pain reported',
        _sign('severe_abdominal_pain')),
    _r('severe_headache', AlertLevel.amber, 'Severe headache reported',
        _sign('severe_headache')),
    _r('blurred_vision', AlertLevel.amber, 'Blurred or changed vision reported',
        _sign('blurred_vision')),
    _r('fever', AlertLevel.amber, 'Fever reported (≥38.0°C)',
        const RuleCondition.any([
          RuleCriterion('temperature_c', op: 'gte', value: 38.0),
        ])),
    _r('severe_vomiting', AlertLevel.amber, 'Severe vomiting reported',
        _sign('severe_vomiting')),
    _r('tachycardia', AlertLevel.amber, 'Pulse elevated (>120 bpm)',
        const RuleCondition.any([
          RuleCriterion('pulse', op: 'gt', value: 120),
        ])),
    _r('bp_elevated', AlertLevel.amber, 'Raised blood pressure (140–159 / 90–109)',
        const RuleCondition.any([
          RuleCriterion('systolic_bp', op: 'gte', value: 140),
          RuleCriterion('diastolic_bp', op: 'gte', value: 90),
        ])),
    _r('weight_loss', AlertLevel.amber, 'Weight loss since previous visit',
        const RuleCondition.any([
          RuleCriterion('weight_loss', op: 'eq', value: true),
        ])),
  ];

  static AlertRule _r(
    String key,
    String level,
    String title,
    RuleCondition cond, {
    String? message,
  }) =>
      AlertRule(
        id: 'default_$key',
        ruleKey: key,
        level: level,
        title: title,
        message: message ??
            (level == AlertLevel.red
                ? 'Potential danger sign — immediate clinical assessment required.'
                : 'Concerning finding — clinical review and follow-up required.'),
        condition: cond,
      );

  static RuleCondition _sign(String key) => RuleCondition.any([
        RuleCriterion('danger_sign', key: key),
      ]);
}

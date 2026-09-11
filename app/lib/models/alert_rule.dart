/// A configurable clinical alert rule (mirrors the `alert_rules` table).
///
/// condition_json shape:
/// {
///   "logic": "any" | "all",
///   "criteria": [
///     {"field": "danger_sign", "key": "severe_headache"},
///     {"field": "systolic_bp", "op": "gte", "value": 160},
///     {"field": "weight_loss", "op": "eq", "value": true}
///   ]
/// }
class AlertRule {
  final String id;
  final String ruleKey;
  final String level;
  final String title;
  final String message;
  final RuleCondition condition;
  final bool enabled;

  AlertRule({
    required this.id,
    required this.ruleKey,
    required this.level,
    required this.title,
    required this.message,
    required this.condition,
    this.enabled = true,
  });

  factory AlertRule.fromMap(Map<String, dynamic> m) => AlertRule(
        id: m['id'] as String? ?? '',
        ruleKey: m['rule_key'] as String? ?? '',
        level: m['level'] as String? ?? 'amber',
        title: m['title'] as String? ?? '',
        message: m['message'] as String? ?? '',
        condition: RuleCondition.fromJson(
            (m['condition_json'] is Map)
                ? (m['condition_json'] as Map).cast<String, dynamic>()
                : RuleCondition.any(const []).toJson()),
        enabled: m['enabled'] as bool? ?? true,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'rule_key': ruleKey,
        'level': level,
        'title': title,
        'message': message,
        'condition_json': condition.toJson(),
        'enabled': enabled,
      };
}

class RuleCriterion {
  final String field;
  final String? op; // eq, ne, gt, gte, lt, lte, between
  final dynamic value;
  final String? key; // for field == danger_sign

  const RuleCriterion(this.field, {this.op, this.value, this.key});

  factory RuleCriterion.fromJson(Map<String, dynamic> m) => RuleCriterion(
        m['field'] as String? ?? '',
        op: m['op'] as String?,
        value: m['value'],
        key: m['key'] as String?,
      );

  Map<String, dynamic> toJson() =>
      {'field': field, 'op': op, 'value': value, 'key': key};
}

class RuleCondition {
  final String logic; // any | all
  final List<RuleCriterion> criteria;

  const RuleCondition(this.logic, this.criteria);

  const RuleCondition.any(this.criteria) : logic = 'any';
  const RuleCondition.all(this.criteria) : logic = 'all';

  factory RuleCondition.fromJson(Map<String, dynamic> m) => RuleCondition(
        m['logic'] as String? ?? 'any',
        (m['criteria'] as List? ?? const [])
            .map((c) =>
                RuleCriterion.fromJson((c as Map).cast<String, dynamic>()))
            .toList(),
      );

  Map<String, dynamic> toJson() => {
        'logic': logic,
        'criteria': criteria.map((c) => c.toJson()).toList(),
      };
}

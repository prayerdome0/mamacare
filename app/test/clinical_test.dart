import 'package:flutter_test/flutter_test.dart';
import 'package:mamacare/services/clinical/gestational_math.dart';
import 'package:mamacare/models/alert_rule.dart';
import 'package:mamacare/models/vitals.dart';
import 'package:mamacare/services/clinical/alert_engine.dart';

void main() {
  group('GestationalMath', () {
    test('EDD = LMP + 280 days (Naegele)', () {
      final lmp = DateTime(2026, 3, 8);
      expect(GestationalMath.eddFromLmp(lmp), DateTime(2026, 12, 22));
    });

    test('GA weeks + days', () {
      final lmp = DateTime(2026, 1, 1);
      final (w, d) = GestationalMath.gaFromLmp(lmp, DateTime(2026, 4, 10));
      expect(w, 14);
      expect(d, 2);
    });
  });

  group('AlertEngine', () {
    final engine = AlertEngine(DefaultAlertRules.all);

    test('headache + visual disturbance → RED (no diagnosis, just flag)', () {
      final fired = engine.evaluate(
        pregnancyId: 'p1',
        reportedSignKeys: {'severe_headache', 'blurred_vision'},
      );
      expect(fired.any((a) => a.ruleKey == 'headache_and_vision'), isTrue);
      expect(
          fired.firstWhere((a) => a.ruleKey == 'headache_and_vision').level,
          'red');
      expect(
          fired
              .firstWhere((a) => a.ruleKey == 'headache_and_vision')
              .message
              .contains('clinical assessment required'),
          isTrue);
    });

    test('BP 165/112 → RED severe; 145/95 → AMBER elevated', () {
      final red = engine.evaluate(
        pregnancyId: 'p1',
        vitals: Vitals(id: 'v1', visitId: 'x', systolicBp: 165, diastolicBp: 112),
      );
      expect(red.any((a) => a.ruleKey == 'bp_severe'), isTrue);

      final amber = engine.evaluate(
        pregnancyId: 'p1',
        vitals: Vitals(id: 'v2', visitId: 'x', systolicBp: 145, diastolicBp: 95),
      );
      expect(amber.any((a) => a.ruleKey == 'bp_elevated'), isTrue);
      expect(amber.any((a) => a.ruleKey == 'bp_severe'), isFalse);
    });

    test('no findings → no alerts', () {
      final fired = engine.evaluate(
        pregnancyId: 'p1',
        vitals: Vitals(
            id: 'v3',
            visitId: 'x',
            systolicBp: 118,
            diastolicBp: 76,
            temperatureC: 36.8,
            pulse: 82),
        reportedSignKeys: {'none_reported'},
      );
      expect(fired, isEmpty);
    });

    test('weight loss vs previous visit → AMBER', () {
      final fired = engine.evaluate(
        pregnancyId: 'p1',
        vitals: Vitals(id: 'v4', visitId: 'x', weightKg: 58.0),
        reportedSignKeys: {'none_reported'},
        previousWeightKg: 60.5,
      );
      expect(fired.any((a) => a.ruleKey == 'weight_loss'), isTrue);
    });
  });

  group('AlertRule JSON round-trip', () {
    test('condition_json matches the Postgres seed shape', () {
      final rule = AlertRule.fromMap({
        'rule_key': 'bp_severe',
        'level': 'red',
        'title': 'Severely raised blood pressure (≥160/110)',
        'message': 'Potential danger sign — immediate clinical assessment required.',
        'condition_json': {
          'logic': 'any',
          'criteria': [
            {'field': 'systolic_bp', 'op': 'gte', 'value': 160},
            {'field': 'diastolic_bp', 'op': 'gte', 'value': 110},
          ]
        },
        'enabled': true,
      });
      expect(rule.condition.logic, 'any');
      expect(rule.condition.criteria.length, 2);
    });
  });
}

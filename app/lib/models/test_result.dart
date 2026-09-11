import 'mother.dart';

class TestResult {
  final String id;
  final String visitId;
  final String testKey; // e.g. urine_protein, hb, hiv, syphilis
  final String? resultValue;
  final String? resultText;
  final int rowVersion;

  TestResult({
    required this.id,
    required this.visitId,
    required this.testKey,
    this.resultValue,
    this.resultText,
    this.rowVersion = 1,
  });

  factory TestResult.fromMap(Map<String, dynamic> m) => TestResult(
        id: m['id'] as String,
        visitId: m['visit_id'] as String,
        testKey: m['test_key'] as String,
        resultValue: m['result_value'] as String?,
        resultText: m['result_text'] as String?,
        rowVersion: m['row_version'] as int? ?? 1,
      );

  Map<String, dynamic> toMap() => {
        'id': id,
        'visit_id': visitId,
        'test_key': testKey,
        'result_value': resultValue,
        'result_text': resultText,
        'row_version': rowVersion,
      };

  String get label =>
      '${testKey.replaceAll('_', ' ')}: ${resultValue ?? resultText ?? '—'}';
}

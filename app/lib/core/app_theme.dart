import 'package:flutter/material.dart';

/// MAMA CARE design system.
/// Green = healthy / routine. Teal = primary action. Red/amber/green badges
/// carry the alert levels. Large touch targets for clinical use.
class AppTheme {
  static const primary = Color(0xFF0F766E);
  static const primaryDark = Color(0xFF0B3B36);
  static const red = Color(0xFFDC2626);
  static const amber = Color(0xFFD97706);
  static const green = Color(0xFF16A34A);
  static const surface = Color(0xFFF4F7F6);
  static const card = Colors.white;
  static const ink = Color(0xFF10231F);
  static const muted = Color(0xFF5B6F6A);

  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primary,
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: surface,
    );
    return base.copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: primaryDark,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 1,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        color: card,
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: true,
        fillColor: Colors.white,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(64, 52),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      listTileTheme: const ListTileThemeData(horizontalTitleGap: 12),
    );
  }

  static Color levelColor(String level) => switch (level) {
        'red' => red,
        'amber' => amber,
        _ => green,
      };
}

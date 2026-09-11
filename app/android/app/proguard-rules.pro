# Flutter keeps defaults; no class obfuscation in the prototype.
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keepclassmembers class * {
   @io.flutter.annotations.FlutterImplementation <fields>;
   @io.flutter.annotations.FlutterImplementation <methods>;
}
-dontwarn java.lang.invoke.**

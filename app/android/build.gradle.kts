allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.layout.buildDirectory.dir("../build")

subprojects {
    afterEvaluate {
        if (plugins.hasPlugin("com.android.application")) {
            extensions.configure<com.android.build.gradle.AppExtension> {
                buildToolsVersion = "34.0.0"
            }
        }
    }
}

subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}

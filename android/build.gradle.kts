plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "za.co.pcremote.controller"
    compileSdk = 35

    defaultConfig {
        applicationId = "za.co.pcremote.controller"
        minSdk = 26
        targetSdk = 35
        versionCode = 22
        versionName = "2.2.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    val previewStore = System.getenv("PCR_SIGNING_STORE")
    if (!previewStore.isNullOrBlank()) {
        signingConfigs.create("personalPreview") {
            storeFile = file(previewStore)
            storeType = "PKCS12"
            storePassword = System.getenv("PCR_SIGNING_PASSWORD")?.trim()
            keyAlias = "pcremote-personal-preview"
            keyPassword = System.getenv("PCR_SIGNING_PASSWORD")?.trim()
        }
        buildTypes.getByName("debug").signingConfig = signingConfigs.getByName("personalPreview")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    testImplementation("junit:junit:4.13.2")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
}

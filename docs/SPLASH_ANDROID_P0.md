# Splash Android: límite medido

El PNG aprobado permanece intacto. Expo SDK 57 instalado genera un foreground contenido en
`imageWidth × imageWidth`, centrado en canvas de 288dp (`expo-splash-screen/plugin/src/withAndroidSplashImages.ts`).
Sin icon background, Android define un círculo seguro de **192dp de diámetro** dentro del canvas:
[AndroidX SplashScreen](https://developer.android.com/reference/androidx/core/splashscreen/SplashScreen).

El archivo es 1672×941. Se mide cada píxel con alpha > 0 y su esquina exterior respecto al
centro del archivo, obteniendo radio conservador 864.432324px. El PNG conserva márgenes transparentes.
Reservando 1dp adicional para resampling, el mayor ancho entero seguro es:

`floor((96 - 1) × 1672 / 864.432324) = 183dp`.

Con 183dp, radio ocupado <=94.612dp, más margen1dp <=96dp. Se pasa de 160 a183dp (+14.375%),
sin recorte de arte ni cambio de aspect ratio. iOS conserva imageWidth280.
`npm run check:splash` reproduce la medición y falla si la configuración excede ese límite.
Es una cota geométrica conservadora, no una aprobación visual de OEM/Android físico.
Requiere nuevo Development Build para aplicar la configuración nativa; no se ejecutó EAS Build.

Prebuild Android ejecutado sin compilación/JDK: los cinco PNG generados mdpi–xxxhdpi
se midieron también, todos con radio alpha <=96dp. Los recursos nativos permanecen ignorados.

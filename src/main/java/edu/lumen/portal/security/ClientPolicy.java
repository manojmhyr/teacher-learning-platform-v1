package edu.lumen.portal.security;

/**
 * Which clients may use the portal.
 *
 * Android browsers are refused: a web page cannot block screenshots or screen
 * recording, while the Android app can (FLAG_SECURE). The app adds
 * {@link #APP_MARKER} to its user agent (capacitor.config.ts), so on Android
 * only the app gets through. The UI shows the matching "open the app" screen.
 */
public final class ClientPolicy {

    public static final String APP_MARKER = "TeacherPortalApp";

    private ClientPolicy() {
    }

    public static boolean isApp(String userAgent) {
        return userAgent != null && userAgent.contains(APP_MARKER);
    }

    public static boolean isAndroidBrowser(String userAgent) {
        return userAgent != null && userAgent.contains("Android") && !isApp(userAgent);
    }
}

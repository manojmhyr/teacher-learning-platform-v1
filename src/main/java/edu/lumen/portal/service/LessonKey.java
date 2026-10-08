package edu.lumen.portal.service;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Derives lesson ids and storage folders from a lesson title.
 *
 * The client never supplies a storage path. The server derives it, validates
 * it, and stores it. This prevents a typo pointing a lesson at an empty
 * folder, a lesson reaching another class's content, and path traversal.
 *
 * Mirrors src/services/lessonKey.ts in the frontend — the UI previews the
 * location while the admin types, and the server decides it for real.
 */
public final class LessonKey {

    private LessonKey() {
    }

    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");
    private static final Pattern TRIM_DASH = Pattern.compile("^-+|-+$");
    private static final Pattern SAFE_PREFIX = Pattern.compile("^[a-z0-9][a-z0-9-]*/$");

    public static String slugify(String value) {
        String ascii = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT);
        String slug = TRIM_DASH.matcher(NON_ALNUM.matcher(ascii).replaceAll("-")).replaceAll("");
        return slug.length() > 60 ? slug.substring(0, 60) : slug;
    }

    /** Always per-class: teaching records are recorded against a class. */
    public static String lessonId(String classId, String subjectId, String title) {
        return slugify(classId) + "-" + slugify(subjectId) + "-" + slugify(title);
    }

    /**
     * `shared` puts one folder behind every class taught the same plan;
     * `per-class` gives each class its own.
     */
    public static String contentKey(String scope, String classId, String subjectId, String title) {
        return "shared".equals(scope)
                ? slugify(subjectId) + "-" + slugify(title)
                : slugify(classId) + "-" + slugify(subjectId) + "-" + slugify(title);
    }

    public static String blobPrefix(String contentKey) {
        return contentKey + "/";
    }

    /** Re-checked before any storage request, not only on save. */
    public static boolean isSafePrefix(String prefix) {
        if (prefix == null) return false;
        if (prefix.contains("..") || prefix.contains("//")) return false;
        return SAFE_PREFIX.matcher(prefix).matches();
    }

    /** Blob paths must stay inside the lesson's own folder. */
    public static boolean isWithinPrefix(String blobPath, String prefix) {
        if (blobPath == null || !isSafePrefix(prefix)) return false;
        if (blobPath.contains("..") || blobPath.startsWith("/")) return false;
        return blobPath.startsWith(prefix);
    }
}

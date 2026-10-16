package edu.lumen.portal.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Lessons, and the access rule that protects them.
 *
 * `findForTeacher` and `findOneForTeacher` carry the whole authorisation model:
 * a teacher sees a lesson only when it is published AND an assignment covers
 * both its class and its subject. Nothing else in the application may load a
 * lesson for a teacher by any other route.
 */
@Repository
public class LessonRepo {

    private final JdbcTemplate jdbc;

    public LessonRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private final RowMapper<Map<String, Object>> row = (rs, i) -> {
        String id = rs.getString("id");
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", id);
        m.put("classId", rs.getString("class_id"));
        m.put("subjectId", rs.getString("subject_id"));
        m.put("title", rs.getString("title"));
        m.put("description", rs.getString("description"));
        m.put("chapter", rs.getString("chapter"));
        m.put("durationMin", rs.getInt("duration_min"));
        m.put("difficulty", rs.getString("difficulty"));
        m.put("contentKey", rs.getString("content_key"));
        m.put("blobPrefix", rs.getString("blob_prefix"));
        m.put("published", rs.getBoolean("published"));
        m.put("createdAt", rs.getObject("created_at", java.time.OffsetDateTime.class).toString());
        m.put("topics", topics(id));
        m.put("objectives", objectives(id));
        m.put("materials", List.of("Lesson Plan"));
        return m;
    };

    private static final String COLS =
            "id, class_id, subject_id, title, description, chapter, duration_min, difficulty, content_key, blob_prefix, published, created_at";

    public List<String> topics(String lessonId) {
        return jdbc.query("SELECT name FROM lesson_topic WHERE lesson_id = ? ORDER BY position",
                (rs, i) -> rs.getString(1), lessonId);
    }

    public List<String> objectives(String lessonId) {
        return jdbc.query("SELECT text FROM lesson_objective WHERE lesson_id = ? ORDER BY position",
                (rs, i) -> rs.getString(1), lessonId);
    }

    /** Admin view: everything, published or not. */
    public List<Map<String, Object>> findAll() {
        return jdbc.query("SELECT " + COLS + " FROM lesson ORDER BY class_id, title", row);
    }

    /** Teacher view: published lessons covered by one of their assignments. */
    public List<Map<String, Object>> findForTeacher(UUID userId) {
        return jdbc.query("""
                SELECT %s FROM lesson l
                WHERE l.published = TRUE
                  AND EXISTS (SELECT 1 FROM teacher_assignment a
                              WHERE a.user_id = ?
                                AND a.class_id = l.class_id
                                AND a.subject_id = l.subject_id)
                ORDER BY l.class_id, l.title
                """.formatted(COLS), row, userId);
    }

    public Optional<Map<String, Object>> findOneForTeacher(UUID userId, String lessonId) {
        return jdbc.query("""
                SELECT %s FROM lesson l
                WHERE l.id = ?
                  AND l.published = TRUE
                  AND EXISTS (SELECT 1 FROM teacher_assignment a
                              WHERE a.user_id = ?
                                AND a.class_id = l.class_id
                                AND a.subject_id = l.subject_id)
                """.formatted(COLS), row, lessonId, userId).stream().findFirst();
    }

    public Optional<Map<String, Object>> findById(String lessonId) {
        return jdbc.query("SELECT " + COLS + " FROM lesson WHERE id = ?", row, lessonId).stream().findFirst();
    }

    public boolean exists(String lessonId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM lesson WHERE id = ?", Integer.class, lessonId);
        return n != null && n > 0;
    }

    public void create(String id, String classId, String subjectId, String title, String description, String chapter,
                       int durationMin, String difficulty, String contentKey, String blobPrefix,
                       List<String> topics, List<String> objectives, UUID createdBy) {
        jdbc.update("""
                INSERT INTO lesson (id, class_id, subject_id, title, description, chapter, duration_min, difficulty,
                                    content_key, blob_prefix, published, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?)
                """, id, classId, subjectId, title, description, chapter, durationMin, difficulty, contentKey, blobPrefix, createdBy);

        for (int i = 0; i < topics.size(); i++) {
            jdbc.update("INSERT INTO lesson_topic (lesson_id, position, name) VALUES (?, ?, ?)", id, i, topics.get(i));
        }
        for (int i = 0; i < objectives.size(); i++) {
            jdbc.update("INSERT INTO lesson_objective (lesson_id, position, text) VALUES (?, ?, ?)", id, i, objectives.get(i));
        }
    }

    /** True when another lesson for the same class and subject already has this title. */
    public boolean titleTaken(String classId, String subjectId, String title, String exceptLessonId) {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM lesson WHERE class_id = ? AND subject_id = ? AND lower(title) = lower(?) AND id <> ?",
                Integer.class, classId, subjectId, title, exceptLessonId);
        return n != null && n > 0;
    }

    /**
     * Edits a lesson's details and replaces its topic and objective lists.
     *
     * The id and content folder never change, so uploaded content stays where
     * it is. Teaching records keep the topic names they were saved with — they
     * are copied, not linked — so renaming or removing a topic leaves history
     * intact.
     */
    @Transactional
    public void update(String id, String title, String description, String chapter, int durationMin, String difficulty,
                       List<String> topics, List<String> objectives) {
        jdbc.update("UPDATE lesson SET title = ?, description = ?, chapter = ?, duration_min = ?, difficulty = ? WHERE id = ?",
                title, description, chapter, durationMin, difficulty, id);
        jdbc.update("DELETE FROM lesson_topic WHERE lesson_id = ?", id);
        for (int i = 0; i < topics.size(); i++) {
            jdbc.update("INSERT INTO lesson_topic (lesson_id, position, name) VALUES (?, ?, ?)", id, i, topics.get(i));
        }
        jdbc.update("DELETE FROM lesson_objective WHERE lesson_id = ?", id);
        for (int i = 0; i < objectives.size(); i++) {
            jdbc.update("INSERT INTO lesson_objective (lesson_id, position, text) VALUES (?, ?, ?)", id, i, objectives.get(i));
        }
    }

    public void setPublished(String lessonId, boolean published) {
        jdbc.update("UPDATE lesson SET published = ? WHERE id = ?", published, lessonId);
    }

    /** Distinct content folders, for the "link an existing folder" picker. */
    public List<String> contentKeys() {
        return jdbc.query("SELECT DISTINCT content_key FROM lesson ORDER BY content_key", (rs, i) -> rs.getString(1));
    }

    /** Is this teacher entitled to the lesson that owns this blob prefix? */
    public boolean canAccessPrefix(UUID userId, String blobPrefix) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*) FROM lesson l
                WHERE l.blob_prefix = ?
                  AND l.published = TRUE
                  AND EXISTS (SELECT 1 FROM teacher_assignment a
                              WHERE a.user_id = ?
                                AND a.class_id = l.class_id
                                AND a.subject_id = l.subject_id)
                """, Integer.class, blobPrefix, userId);
        return n != null && n > 0;
    }
}

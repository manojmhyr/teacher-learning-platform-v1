package edu.lumen.portal.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Teaching records — append only.
 *
 * There is deliberately no update or delete method. The database enforces the
 * same rule with a trigger, so neither a bug here nor a stray script can
 * rewrite what a teacher recorded.
 */
@Repository
public class RecordRepo {

    private final JdbcTemplate jdbc;

    public RecordRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private final RowMapper<Map<String, Object>> row = (rs, i) -> {
        UUID id = rs.getObject("id", UUID.class);
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", id.toString());
        m.put("userId", rs.getObject("user_id", UUID.class).toString());
        m.put("lessonId", rs.getString("lesson_id"));
        m.put("classId", rs.getString("class_id"));
        m.put("dateTaught", rs.getObject("date_taught", LocalDate.class).toString());
        m.put("durationMin", rs.getInt("duration_min"));
        m.put("notes", rs.getString("notes"));
        m.put("createdAt", rs.getObject("created_at", java.time.OffsetDateTime.class).toString());
        m.put("topics", topics(id));
        return m;
    };

    private static final String COLS = "id, user_id, lesson_id, class_id, date_taught, duration_min, notes, created_at";

    public List<String> topics(UUID recordId) {
        return jdbc.query("SELECT topic FROM teaching_record_topic WHERE record_id = ? ORDER BY topic",
                (rs, i) -> rs.getString(1), recordId);
    }

    public List<Map<String, Object>> findForUser(UUID userId) {
        return jdbc.query("SELECT " + COLS + " FROM teaching_record WHERE user_id = ? ORDER BY date_taught DESC, created_at DESC",
                row, userId);
    }

    public List<Map<String, Object>> findAll() {
        return jdbc.query("SELECT " + COLS + " FROM teaching_record ORDER BY date_taught DESC, created_at DESC LIMIT 500", row);
    }

    public boolean exists(UUID id) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM teaching_record WHERE id = ?", Integer.class, id);
        return n != null && n > 0;
    }

    /**
     * Inserts a record. The id is the client-generated idempotency key, so a
     * retry after a flaky classroom network cannot create a duplicate.
     */
    @Transactional
    public void append(UUID id, UUID userId, String lessonId, String classId, LocalDate dateTaught,
                       int durationMin, String notes, List<String> topics) {
        jdbc.update("""
                INSERT INTO teaching_record (id, user_id, lesson_id, class_id, date_taught, duration_min, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, id, userId, lessonId, classId, dateTaught, durationMin, notes == null ? "" : notes);
        for (String t : topics) {
            jdbc.update("INSERT INTO teaching_record_topic (record_id, topic) VALUES (?, ?) ON CONFLICT DO NOTHING", id, t);
        }
    }
}

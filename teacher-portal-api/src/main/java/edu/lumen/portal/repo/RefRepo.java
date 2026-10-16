package edu.lumen.portal.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Reference data (classes, subjects) and the audit trail. */
@Repository
public class RefRepo {

    private final JdbcTemplate jdbc;

    public RefRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Map<String, Object>> CLASS_ROW = (rs, i) -> {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rs.getString("id"));
        m.put("name", rs.getString("name"));
        m.put("grade", rs.getInt("grade"));
        m.put("students", rs.getInt("students"));
        m.put("room", rs.getString("room"));
        m.put("schedule", rs.getString("schedule"));
        return m;
    };

    private static final RowMapper<Map<String, Object>> SUBJECT_ROW = (rs, i) -> {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rs.getString("id"));
        m.put("name", rs.getString("name"));
        m.put("icon", rs.getString("icon"));
        m.put("chapters", new ArrayList<String>());
        return m;
    };

    private static final RowMapper<String> STRING_ROW = (rs, i) -> rs.getString(1);

    public List<Map<String, Object>> classes() {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT id, name, grade, students, room, schedule FROM class_room ORDER BY grade, id", CLASS_ROW);
        for (Map<String, Object> c : rows) {
            List<String> subjectIds = jdbc.query(
                    "SELECT subject_id FROM class_subject WHERE class_id = ? ORDER BY subject_id",
                    STRING_ROW, c.get("id"));
            c.put("subjectIds", subjectIds);
        }
        return rows;
    }

    public List<Map<String, Object>> subjects() {
        List<Map<String, Object>> rows = jdbc.query("SELECT id, name, icon FROM subject ORDER BY name", SUBJECT_ROW);
        for (Map<String, Object> s : rows) {
            // Chapters are whatever the lessons actually use, so the admin UI
            // can suggest existing ones without a separate table to maintain.
            List<String> chapters = jdbc.query(
                    "SELECT DISTINCT chapter FROM lesson WHERE subject_id = ? AND chapter <> '' ORDER BY chapter",
                    STRING_ROW, s.get("id"));
            s.put("chapters", chapters);
        }
        return rows;
    }

    public boolean classOffersSubject(String classId, String subjectId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM class_subject WHERE class_id = ? AND subject_id = ?",
                Integer.class, classId, subjectId);
        return n != null && n > 0;
    }

    // ---- audit --------------------------------------------------------------

    public void audit(UUID userId, String action, String detail, String ip) {
        jdbc.update("INSERT INTO access_audit (user_id, action, detail, ip) VALUES (?, ?, ?, ?)", userId, action, detail, ip);
    }

    private static final RowMapper<Map<String, Object>> AUDIT_ROW = (rs, i) -> {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(rs.getLong("id")));
        UUID uid = rs.getObject("user_id", UUID.class);
        m.put("userId", uid == null ? null : uid.toString());
        m.put("userName", rs.getString("full_name"));
        m.put("action", rs.getString("action"));
        m.put("detail", rs.getString("detail"));
        m.put("at", rs.getObject("at", OffsetDateTime.class).toString());
        return m;
    };

    public List<Map<String, Object>> auditTrail(int limit) {
        return jdbc.query("""
                SELECT a.id, a.user_id, a.action, a.detail, a.at, u.full_name
                FROM access_audit a
                LEFT JOIN app_user u ON u.id = a.user_id
                ORDER BY a.at DESC
                LIMIT ?
                """, AUDIT_ROW, limit);
    }
}

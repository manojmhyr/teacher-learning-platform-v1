package edu.lumen.portal.repo;

import edu.lumen.portal.security.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Accounts, credentials, sessions and assignments. */
@Repository
public class UserRepo {

    private final JdbcTemplate jdbc;
    private static final SecureRandom RANDOM = new SecureRandom();

    public UserRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Map<String, Object>> USER_ROW = (rs, i) -> {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", rs.getObject("id", UUID.class).toString());
        m.put("employeeId", rs.getString("employee_id"));
        m.put("fullName", rs.getString("full_name"));
        m.put("email", rs.getString("email"));
        m.put("title", rs.getString("title"));
        m.put("role", rs.getString("role"));
        m.put("mustChange", rs.getBoolean("must_change"));
        m.put("active", rs.getBoolean("active"));
        OffsetDateTime last = rs.getObject("last_login_at", OffsetDateTime.class);
        m.put("lastLoginAt", last == null ? null : last.toString());
        m.put("createdAt", rs.getObject("created_at", OffsetDateTime.class).toString());
        return m;
    };

    private static final String SELECT_USER =
            "SELECT id, employee_id, full_name, email, title, role, must_change, active, last_login_at, created_at FROM app_user ";

    public List<Map<String, Object>> findAll() {
        return jdbc.query(SELECT_USER + "ORDER BY role DESC, full_name", USER_ROW);
    }

    public Optional<Map<String, Object>> findById(UUID id) {
        return jdbc.query(SELECT_USER + "WHERE id = ?", USER_ROW, id).stream().findFirst();
    }

    /** Matches on employee ID or email, case-insensitively. */
    public Optional<Map<String, Object>> findByIdentifier(String identifier) {
        return jdbc.query(SELECT_USER + "WHERE lower(employee_id) = lower(?) OR lower(email) = lower(?)",
                USER_ROW, identifier, identifier).stream().findFirst();
    }

    public Optional<String> passwordHash(UUID userId) {
        return jdbc.query("SELECT password_hash FROM user_credential WHERE user_id = ?",
                (rs, i) -> rs.getString(1), userId).stream().findFirst();
    }

    public boolean employeeIdTaken(String employeeId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM app_user WHERE lower(employee_id) = lower(?)", Integer.class, employeeId);
        return n != null && n > 0;
    }

    public UUID create(String employeeId, String fullName, String email, String title, String role, String passwordHash) {
        UUID id = jdbc.queryForObject(
                "INSERT INTO app_user (employee_id, full_name, email, title, role, must_change, active) "
                        + "VALUES (?, ?, ?, ?, ?, TRUE, TRUE) RETURNING id",
                UUID.class, employeeId.trim().toUpperCase(), fullName.trim(),
                (email == null || email.isBlank()) ? null : email.trim(), title, role);
        jdbc.update("INSERT INTO user_credential (user_id, password_hash) VALUES (?, ?)", id, passwordHash);
        return id;
    }

    public void setPassword(UUID userId, String passwordHash, boolean mustChange) {
        jdbc.update("UPDATE user_credential SET password_hash = ?, changed_at = now() WHERE user_id = ?", passwordHash, userId);
        jdbc.update("UPDATE app_user SET must_change = ? WHERE id = ?", mustChange, userId);
    }

    public void setActive(UUID userId, boolean active) {
        jdbc.update("UPDATE app_user SET active = ? WHERE id = ?", active, userId);
        // Revoking sessions is what makes deactivation take effect immediately
        // rather than whenever the current token happens to expire.
        if (!active) jdbc.update("DELETE FROM user_session WHERE user_id = ?", userId);
    }

    public void markLogin(UUID userId) {
        jdbc.update("UPDATE app_user SET last_login_at = now() WHERE id = ?", userId);
    }

    // ---- sessions -----------------------------------------------------------

    /** Creates an opaque session token. Opaque, so it can be revoked server-side. */
    public String createSession(UUID userId, int hours) {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        jdbc.update("INSERT INTO user_session (token, user_id, expires_at) VALUES (?, ?, now() + (? || ' hours')::interval)",
                token, userId, String.valueOf(hours));
        return token;
    }

    /** Resolves a token to a live user, or empty if expired, revoked or inactive. */
    public Optional<CurrentUser> resolveSession(String token) {
        return jdbc.query("""
                        SELECT u.id, u.employee_id, u.full_name, u.role, u.must_change
                        FROM user_session s
                        JOIN app_user u ON u.id = s.user_id
                        WHERE s.token = ? AND s.expires_at > now() AND u.active = TRUE
                        """,
                (rs, i) -> new CurrentUser(rs.getObject("id", UUID.class), rs.getString("employee_id"),
                        rs.getString("full_name"), rs.getString("role"), rs.getBoolean("must_change")),
                token).stream().findFirst();
    }

    public void deleteSession(String token) {
        jdbc.update("DELETE FROM user_session WHERE token = ?", token);
    }

    public void deleteExpiredSessions() {
        jdbc.update("DELETE FROM user_session WHERE expires_at <= now()");
    }

    // ---- assignments --------------------------------------------------------

    public List<Map<String, Object>> assignmentsFor(UUID userId) {
        return jdbc.query("SELECT class_id, subject_id FROM teacher_assignment WHERE user_id = ? ORDER BY class_id, subject_id",
                (rs, i) -> Map.<String, Object>of("classId", rs.getString(1), "subjectId", rs.getString(2)), userId);
    }

    public List<Map<String, Object>> allAssignments() {
        return jdbc.query("SELECT user_id, class_id, subject_id FROM teacher_assignment",
                (rs, i) -> Map.<String, Object>of(
                        "userId", rs.getObject(1, UUID.class).toString(),
                        "classId", rs.getString(2),
                        "subjectId", rs.getString(3)));
    }

    /** Replaces a teacher's assignments wholesale. Teaching records are untouched. */
    public void replaceAssignments(UUID userId, List<String[]> pairs) {
        jdbc.update("DELETE FROM teacher_assignment WHERE user_id = ?", userId);
        for (String[] p : pairs) {
            jdbc.update("INSERT INTO teacher_assignment (user_id, class_id, subject_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
                    userId, p[0], p[1]);
        }
    }

    /** Unused but kept: handy when debugging token values in logs. */
    public static String fingerprint(String token) {
        return HexFormat.of().formatHex(token.substring(0, Math.min(4, token.length())).getBytes());
    }
}

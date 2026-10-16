package edu.lumen.portal.web;

import edu.lumen.portal.repo.RefRepo;
import edu.lumen.portal.repo.UserRepo;
import edu.lumen.portal.security.ClientPolicy;
import edu.lumen.portal.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
public class AuthController {

    private final UserRepo users;
    private final RefRepo ref;
    private final PasswordEncoder encoder;

    @Value("${portal.session-hours:8}")
    private int sessionHours;

    public AuthController(UserRepo users, RefRepo ref, PasswordEncoder encoder) {
        this.users = users;
        this.ref = ref;
        this.encoder = encoder;
    }

    /**
     * `deviceId` is a random id the browser keeps for itself; `force` signs
     * out the account's other device instead of refusing.
     */
    public record LoginRequest(@NotBlank String identifier, @NotBlank String password, String deviceId, Boolean force) {
    }

    /** A session not heard from for this long counts as closed (the UI heartbeats at least once a minute). */
    private static final int STALE_SECONDS = 180;

    public record ChangePasswordRequest(@NotBlank String current, @NotBlank String next) {
    }

    /**
     * Signs in with an employee ID (or email) and password.
     *
     * Failures return one identical message whatever went wrong. A different
     * response for "no such user" would turn this endpoint into an account
     * enumerator.
     */
    @PostMapping("/auth/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody LoginRequest body, HttpServletRequest http) {
        if (ClientPolicy.isAndroidBrowser(http.getHeader("User-Agent"))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "status", 403,
                    "code", "APP_REQUIRED",
                    "message", "On Android, Teacher Portal works only in its app. Open the Teacher Portal app to sign in."));
        }
        Optional<Map<String, Object>> found = users.findByIdentifier(body.identifier());

        // Hash a dummy value when the user does not exist, so a missing account
        // does not answer measurably faster than a wrong password.
        String hash = found.map(u -> users.passwordHash(UUID.fromString((String) u.get("id"))).orElse(null))
                .orElse("$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");

        boolean ok = encoder.matches(body.password(), hash);
        if (found.isEmpty() || !ok) {
            found.ifPresent(u -> ref.audit(UUID.fromString((String) u.get("id")), "LOGIN_FAILED", "Bad password", ip(http)));
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Employee ID or password is incorrect.");
        }

        Map<String, Object> user = found.get();
        if (!Boolean.TRUE.equals(user.get("active"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This account has been deactivated. Contact your administrator.");
        }

        UUID id = UUID.fromString((String) user.get("id"));
        String deviceId = cleanDeviceId(body.deviceId());
        String deviceLabel = deviceLabel(http.getHeader("User-Agent"));

        // One device at a time. Checked only after the password is verified, so
        // this answer reveals nothing to someone who does not know it.
        Optional<Map<String, Object>> elsewhere = users.liveSessionElsewhere(id, deviceId, STALE_SECONDS);
        boolean force = Boolean.TRUE.equals(body.force());
        if (elsewhere.isPresent() && !force) {
            ref.audit(id, "LOGIN_BLOCKED", "Already signed in on " + elsewhere.get().get("device"), ip(http));
            Map<String, Object> conflict = new LinkedHashMap<>();
            conflict.put("status", 409);
            conflict.put("code", "SESSION_ACTIVE");
            conflict.put("message", "This account is already signed in on " + elsewhere.get().get("device")
                    + ". Sign out there first, or sign it out from here.");
            conflict.putAll(elsewhere.get());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(conflict);
        }

        // Whatever else was open — another device, or a tab this browser closed — ends now.
        users.revokeAllSessions(id, "REPLACED");
        if (elsewhere.isPresent()) {
            ref.audit(id, "SESSION_REPLACED", "Signed out " + elsewhere.get().get("device") + " to sign in on " + deviceLabel, ip(http));
        }

        String token = users.createSession(id, sessionHours, deviceId, deviceLabel);
        users.markLogin(id);
        ref.audit(id, "LOGIN", "Signed in on " + deviceLabel, ip(http));

        return ResponseEntity.ok(Map.of(
                "accessToken", token,
                "expiresIn", sessionHours * 3600,
                "user", user));
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(@AuthenticationPrincipal CurrentUser me, HttpServletRequest http) {
        String header = http.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) users.deleteSession(header.substring(7).trim());
        if (me != null) ref.audit(me.id(), "LOGOUT", "Signed out", ip(http));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/auth/me")
    public Map<String, Object> me(@AuthenticationPrincipal CurrentUser me) {
        return users.findById(me.id()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    /** Also the screen a teacher must pass through after a temporary password. */
    @PostMapping("/auth/change-password")
    public ResponseEntity<Void> changePassword(@AuthenticationPrincipal CurrentUser me,
                                               @RequestBody ChangePasswordRequest body,
                                               HttpServletRequest http) {
        String hash = users.passwordHash(me.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!encoder.matches(body.current(), hash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your current password is incorrect.");
        }
        if (body.next().length() < 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use at least 10 characters.");
        }
        if (encoder.matches(body.next(), hash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a password different from your current one.");
        }
        users.setPassword(me.id(), encoder.encode(body.next()), false);
        ref.audit(me.id(), "PASSWORD_CHANGED", "Changed own password", ip(http));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    private static String cleanDeviceId(String raw) {
        if (raw == null) return null;
        String id = raw.trim();
        return id.matches("[A-Za-z0-9-]{8,64}") ? id : null;
    }

    /** "Chrome on Windows" — enough for a person to recognise their own device. */
    static String deviceLabel(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) return "another device";
        String ua = userAgent;
        if (ClientPolicy.isApp(ua)) return ua.contains("Android") ? "the Teacher Portal app on Android" : "the Teacher Portal app";
        String browser = ua.contains("Edg/") ? "Edge"
                : ua.contains("OPR/") ? "Opera"
                : ua.contains("Firefox/") ? "Firefox"
                : ua.contains("Chrome/") ? "Chrome"
                : ua.contains("Safari/") ? "Safari"
                : "a browser";
        String os = ua.contains("Windows") ? "Windows"
                : ua.contains("Android") ? "Android"
                : ua.contains("iPhone") || ua.contains("iPad") ? "iOS"
                : ua.contains("Mac OS X") ? "macOS"
                : ua.contains("Linux") ? "Linux"
                : "an unknown device";
        return browser + " on " + os;
    }

    static String ip(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded != null && !forwarded.isBlank() ? forwarded.split(",")[0].trim() : request.getRemoteAddr();
    }
}

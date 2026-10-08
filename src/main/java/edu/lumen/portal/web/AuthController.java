package edu.lumen.portal.web;

import edu.lumen.portal.repo.RefRepo;
import edu.lumen.portal.repo.UserRepo;
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

    public record LoginRequest(@NotBlank String identifier, @NotBlank String password) {
    }

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
    public Map<String, Object> login(@RequestBody LoginRequest body, HttpServletRequest http) {
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
        String token = users.createSession(id, sessionHours);
        users.markLogin(id);
        ref.audit(id, "LOGIN", "Signed in", ip(http));

        return Map.of(
                "accessToken", token,
                "expiresIn", sessionHours * 3600,
                "user", user);
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

    static String ip(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded != null && !forwarded.isBlank() ? forwarded.split(",")[0].trim() : request.getRemoteAddr();
    }
}

package edu.lumen.portal.web;

import edu.lumen.portal.repo.LessonRepo;
import edu.lumen.portal.repo.RecordRepo;
import edu.lumen.portal.repo.RefRepo;
import edu.lumen.portal.repo.UserRepo;
import edu.lumen.portal.security.CurrentUser;
import edu.lumen.portal.service.LessonKey;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Administrator endpoints.
 *
 * The whole class sits behind `hasRole('ADMIN')` in SecurityConfig, so a
 * teacher's token gets 403 before any handler runs.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final UserRepo users;
    private final LessonRepo lessons;
    private final RecordRepo records;
    private final RefRepo ref;
    private final PasswordEncoder encoder;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String[] WORDS = {
            "maple", "river", "cobalt", "lantern", "harbour", "willow", "ember", "quartz", "meadow", "cedar"};

    public AdminController(UserRepo users, LessonRepo lessons, RecordRepo records, RefRepo ref, PasswordEncoder encoder) {
        this.users = users;
        this.lessons = lessons;
        this.records = records;
        this.ref = ref;
        this.encoder = encoder;
    }

    /** Readable temporary password an admin can read out loud. */
    private static String tempPassword() {
        return WORDS[RANDOM.nextInt(WORDS.length)] + "-" + WORDS[RANDOM.nextInt(WORDS.length)] + "-" + (10 + RANDOM.nextInt(90));
    }

    // ---- teachers -----------------------------------------------------------

    @GetMapping("/teachers")
    public List<Map<String, Object>> list() {
        return users.findAll();
    }

    public record CreateTeacherRequest(String employeeId, String fullName, String email, String title, String role) {
    }

    /**
     * Creates an account and returns a temporary password ONCE.
     *
     * It is never stored in readable form and never returned again — only the
     * BCrypt hash is kept. If the admin loses it, they issue a new one.
     */
    @PostMapping("/teachers")
    public ResponseEntity<Map<String, Object>> create(@AuthenticationPrincipal CurrentUser me,
                                                      @RequestBody CreateTeacherRequest body,
                                                      HttpServletRequest http) {
        if (body.employeeId() == null || body.employeeId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An employee ID is required.");
        }
        if (body.fullName() == null || body.fullName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A full name is required.");
        }
        if (users.employeeIdTaken(body.employeeId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That employee ID is already in use.");
        }
        String role = "ADMIN".equals(body.role()) ? "ADMIN" : "TEACHER";
        String temp = tempPassword();
        UUID id = users.create(body.employeeId(), body.fullName(), body.email(),
                body.title() == null || body.title().isBlank() ? "Teacher" : body.title(), role, encoder.encode(temp));

        ref.audit(me.id(), "USER_CREATED", body.employeeId() + " (" + role + ")", AuthController.ip(http));
        Map<String, Object> user = users.findById(id).orElseThrow();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("user", user, "temporaryPassword", temp));
    }

    @PostMapping("/teachers/{id}/reset-password")
    public Map<String, Object> resetPassword(@AuthenticationPrincipal CurrentUser me,
                                             @PathVariable UUID id,
                                             HttpServletRequest http) {
        users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String temp = tempPassword();
        users.setPassword(id, encoder.encode(temp), true);
        ref.audit(me.id(), "PASSWORD_RESET", "for user " + id, AuthController.ip(http));
        return Map.of("temporaryPassword", temp);
    }

    public record ActiveRequest(boolean active) {
    }

    @PostMapping("/teachers/{id}/active")
    public ResponseEntity<Void> setActive(@AuthenticationPrincipal CurrentUser me,
                                          @PathVariable UUID id,
                                          @RequestBody ActiveRequest body,
                                          HttpServletRequest http) {
        if (id.equals(me.id())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot deactivate your own account.");
        }
        users.setActive(id, body.active());
        ref.audit(me.id(), body.active() ? "USER_ACTIVATED" : "USER_DEACTIVATED", "user " + id, AuthController.ip(http));
        return ResponseEntity.noContent().build();
    }

    public record AssignmentPair(String classId, String subjectId) {
    }

    public record AssignmentsRequest(List<AssignmentPair> assignments) {
    }

    /** Replaces a teacher's assignments. Teaching records are never touched. */
    @PostMapping("/teachers/{id}/assignments")
    public ResponseEntity<Void> assignments(@AuthenticationPrincipal CurrentUser me,
                                            @PathVariable UUID id,
                                            @RequestBody AssignmentsRequest body,
                                            HttpServletRequest http) {
        users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<String[]> pairs = new ArrayList<>();
        for (AssignmentPair p : body.assignments() == null ? List.<AssignmentPair>of() : body.assignments()) {
            if (!ref.classOffersSubject(p.classId(), p.subjectId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Class " + p.classId() + " does not offer " + p.subjectId() + ".");
            }
            pairs.add(new String[]{p.classId(), p.subjectId()});
        }
        users.replaceAssignments(id, pairs);
        ref.audit(me.id(), "ASSIGNMENTS_UPDATED", id + " → " + pairs.size() + " pairs", AuthController.ip(http));
        return ResponseEntity.noContent().build();
    }

    // ---- lessons ------------------------------------------------------------

    public record CreateLessonRequest(List<String> classIds, String subjectId, String title, String description,
                                      String chapter, Integer durationMin, String difficulty, List<String> topics,
                                      List<String> objectives, String contentScope, String linkExistingKey) {
    }

    /**
     * Creates one lesson per selected class.
     *
     * The storage folder is DERIVED here from the title — the client may not
     * supply a path. A folder may be shared across classes, or linked to one
     * that already exists (chosen from the server's own list).
     */
    @PostMapping("/lessons")
    public ResponseEntity<List<Map<String, Object>>> createLessons(@AuthenticationPrincipal CurrentUser me,
                                                                   @RequestBody CreateLessonRequest body,
                                                                   HttpServletRequest http) {
        if (body.title() == null || body.title().trim().length() < 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a lesson title of at least 3 characters.");
        }
        if (body.classIds() == null || body.classIds().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select at least one class.");
        }
        if (body.topics() == null || body.topics().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Add at least one coverage topic.");
        }

        // A linked folder must be one we already know about — never free text.
        String linked = body.linkExistingKey();
        if (linked != null && !linked.isBlank() && !lessons.contentKeys().contains(linked)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown content folder.");
        }

        String scope = "per-class".equals(body.contentScope()) ? "per-class" : "shared";
        List<Map<String, Object>> created = new ArrayList<>();

        for (String classId : body.classIds()) {
            if (!ref.classOffersSubject(classId, body.subjectId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Class " + classId + " does not offer " + body.subjectId() + ".");
            }
            String id = LessonKey.lessonId(classId, body.subjectId(), body.title());
            if (lessons.exists(id)) continue;

            String key = (linked != null && !linked.isBlank())
                    ? linked
                    : LessonKey.contentKey(scope, classId, body.subjectId(), body.title());
            String prefix = LessonKey.blobPrefix(key);
            if (!LessonKey.isSafePrefix(prefix)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The title does not produce a usable folder name.");
            }

            lessons.create(id, classId, body.subjectId(), body.title().trim(),
                    body.description() == null ? "" : body.description().trim(),
                    body.chapter() == null ? "" : body.chapter().trim(),
                    body.durationMin() == null ? 45 : body.durationMin(),
                    body.difficulty() == null ? "Beginner" : body.difficulty(),
                    key, prefix, body.topics(),
                    body.objectives() == null ? List.of() : body.objectives(), me.id());

            lessons.findById(id).ifPresent(created::add);
        }

        ref.audit(me.id(), "LESSON_CREATED", body.title() + " × " + created.size(), AuthController.ip(http));
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    public record PublishRequest(boolean published) {
    }

    @PostMapping("/lessons/{id}/publish")
    public ResponseEntity<Void> publish(@AuthenticationPrincipal CurrentUser me,
                                        @PathVariable String id,
                                        @RequestBody PublishRequest body,
                                        HttpServletRequest http) {
        if (!lessons.exists(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        lessons.setPublished(id, body.published());
        ref.audit(me.id(), body.published() ? "LESSON_PUBLISHED" : "LESSON_UNPUBLISHED", id, AuthController.ip(http));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/content-keys")
    public List<String> contentKeys() {
        return lessons.contentKeys();
    }

    // ---- oversight ----------------------------------------------------------

    @GetMapping("/records")
    public List<Map<String, Object>> allRecords() {
        return records.findAll();
    }

    @GetMapping("/audit")
    public List<Map<String, Object>> audit(@RequestParam(defaultValue = "200") int limit) {
        return ref.auditTrail(Math.min(limit, 500));
    }
}

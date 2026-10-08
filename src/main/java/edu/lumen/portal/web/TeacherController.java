package edu.lumen.portal.web;

import edu.lumen.portal.repo.LessonRepo;
import edu.lumen.portal.repo.RecordRepo;
import edu.lumen.portal.repo.RefRepo;
import edu.lumen.portal.repo.UserRepo;
import edu.lumen.portal.security.CurrentUser;
import edu.lumen.portal.service.LessonKey;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Everything a teacher may call.
 *
 * Each endpoint re-derives what this user is entitled to from the database.
 * The UI's scoping decides what is *shown*; these queries decide what is
 * *served*, which is the part that actually protects content.
 */
@RestController
@RequestMapping("/api")
public class TeacherController {

    private final LessonRepo lessons;
    private final RecordRepo records;
    private final UserRepo users;
    private final RefRepo ref;

    @Value("${portal.azure.blob-base-url:}")
    private String blobBaseUrl;

    @Value("${portal.azure.container:lesson-content}")
    private String container;

    @Value("${portal.azure.sas-ttl-seconds:300}")
    private int sasTtl;

    public TeacherController(LessonRepo lessons, RecordRepo records, UserRepo users, RefRepo ref) {
        this.lessons = lessons;
        this.records = records;
        this.users = users;
        this.ref = ref;
    }

    /** Classes and subjects, plus this user's assignments. */
    @GetMapping("/reference")
    public Map<String, Object> reference(@AuthenticationPrincipal CurrentUser me) {
        return Map.of(
                "classes", ref.classes(),
                "subjects", ref.subjects(),
                "assignments", me.isAdmin() ? users.allAssignments() : users.assignmentsFor(me.id()));
    }

    @GetMapping("/lessons")
    public List<Map<String, Object>> lessons(@AuthenticationPrincipal CurrentUser me) {
        return me.isAdmin() ? lessons.findAll() : lessons.findForTeacher(me.id());
    }

    @GetMapping("/lessons/{id}")
    public Map<String, Object> lesson(@AuthenticationPrincipal CurrentUser me, @PathVariable String id) {
        // 404 rather than 403: a teacher should not be able to discover which
        // lessons exist for classes they do not teach.
        return (me.isAdmin() ? lessons.findById(id) : lessons.findOneForTeacher(me.id(), id))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lesson not available"));
    }

    @GetMapping("/teaching-records/mine")
    public List<Map<String, Object>> myRecords(@AuthenticationPrincipal CurrentUser me) {
        return records.findForUser(me.id());
    }

    public record RecordRequest(String id, String lessonId, String classId, String dateTaught,
                                Integer durationMin, String notes, List<String> topics) {
    }

    /**
     * Appends a teaching record.
     *
     * The client-generated id doubles as the idempotency key: a retry on a
     * flaky classroom network returns 200 instead of inserting a duplicate.
     */
    @PostMapping("/teaching-records")
    public ResponseEntity<Map<String, Object>> addRecord(@AuthenticationPrincipal CurrentUser me,
                                                         @RequestBody RecordRequest body,
                                                         HttpServletRequest http) {
        UUID id;
        try {
            id = UUID.fromString(body.id());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A record id (UUID) is required.");
        }

        if (records.exists(id)) {
            return ResponseEntity.ok(Map.of("status", "already-recorded", "id", id.toString()));
        }

        // The teacher must be entitled to the lesson they are recording against.
        Map<String, Object> lesson = lessons.findOneForTeacher(me.id(), body.lessonId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not assigned to this lesson."));

        if (body.topics() == null || body.topics().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select at least one topic that was covered.");
        }
        LocalDate date;
        try {
            date = LocalDate.parse(body.dateTaught());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid date taught.");
        }
        if (date.isAfter(LocalDate.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The date taught cannot be in the future.");
        }
        int duration = body.durationMin() == null ? 0 : body.durationMin();
        if (duration <= 0 || duration > 240) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a duration between 1 and 240 minutes.");
        }

        // Only topics that belong to this lesson may be recorded.
        List<String> valid = lessons.topics(body.lessonId());
        List<String> topics = body.topics().stream().filter(valid::contains).toList();
        if (topics.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "None of the submitted topics belong to this lesson.");
        }

        String classId = (String) lesson.get("classId");
        records.append(id, me.id(), body.lessonId(), classId, date, duration, body.notes(), topics);
        ref.audit(me.id(), "RECORD_SAVED", body.lessonId() + " — " + String.join(", ", topics), AuthController.ip(http));

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("status", "recorded", "id", id.toString()));
    }

    /** This user's own audit trail. The full one is admin-only. */
    @GetMapping("/activity/mine")
    public List<Map<String, Object>> myActivity(@AuthenticationPrincipal CurrentUser me) {
        return ref.auditTrail(400).stream()
                .filter(a -> me.id().toString().equals(a.get("userId")))
                .limit(150)
                .toList();
    }

    /**
     * Mints a short-lived, read-only SAS URL for one blob.
     *
     * Not implemented locally: it needs a storage account and a managed
     * identity. Until configured, the UI serves demo content, so the whole
     * application still runs. The entitlement check below is the important
     * part and is already in place — wiring Azure in means replacing the final
     * block, not rethinking access control.
     */
    @GetMapping("/content/sas")
    public Map<String, Object> sas(@AuthenticationPrincipal CurrentUser me,
                                   @RequestParam String blob,
                                   HttpServletRequest http) {

        String prefix = blob.contains("/") ? blob.substring(0, blob.indexOf('/') + 1) : "";
        if (!LessonKey.isSafePrefix(prefix) || !LessonKey.isWithinPrefix(blob, prefix)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid blob path.");
        }
        if (!me.isAdmin() && !lessons.canAccessPrefix(me.id(), prefix)) {
            ref.audit(me.id(), "SAS_DENIED", blob, AuthController.ip(http));
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not entitled to this content.");
        }

        if (blobBaseUrl == null || blobBaseUrl.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Azure storage is not configured. Set AZURE_BLOB_BASE_URL, or run the UI with VITE_CONTENT_SOURCE=mock.");
        }

        // TODO (Azure stage): replace with a user-delegation SAS from a
        // managed identity. Cap the TTL server-side; never trust the client's.
        ref.audit(me.id(), "SAS_ISSUED", blob, AuthController.ip(http));
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED,
                "SAS minting is not implemented yet — see docs/AZURE_SETUP.md in the frontend repo.");
    }

    @SuppressWarnings("unused")
    private String containerName() {
        return container;
    }

    @SuppressWarnings("unused")
    private int ttl() {
        return sasTtl;
    }
}

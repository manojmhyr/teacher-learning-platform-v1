package edu.lumen.portal.security;

import java.util.UUID;

/** The authenticated caller, resolved from the bearer token on every request. */
public record CurrentUser(UUID id, String employeeId, String fullName, String role, boolean mustChange) {

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }
}

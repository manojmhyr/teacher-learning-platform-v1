package edu.lumen.portal.security;

import edu.lumen.portal.repo.UserRepo;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * Resolves the bearer token on every request.
 *
 * The token is opaque and looked up in `user_session`, so revoking a session —
 * on logout, or when an admin deactivates an account — takes effect on the
 * very next request rather than whenever a signed token would have expired.
 */
@Component
public class TokenAuthFilter extends OncePerRequestFilter {

    private final UserRepo users;

    public TokenAuthFilter(UserRepo users) {
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7).trim();
            Optional<CurrentUser> user = users.resolveSession(token);
            if (user.isPresent()) {
                CurrentUser cu = user.get();
                var auth = new UsernamePasswordAuthenticationToken(
                        cu, token, List.of(new SimpleGrantedAuthority("ROLE_" + cu.role())));
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }
        chain.doFilter(request, response);
    }
}

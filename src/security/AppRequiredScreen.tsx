/**
 * Shown instead of the portal in an Android browser. Deliberately carries no
 * lesson content, so a screenshot of it reveals nothing.
 */
export function AppRequiredScreen() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#1b3a2f',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <div aria-hidden style={{ fontSize: 48, marginBottom: 16 }}>
          🔒
        </div>
        <h1 style={{ fontSize: 24, margin: '0 0 12px' }}>Open the Teacher Portal app</h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, margin: '0 0 12px', opacity: 0.9 }}>
          On Android phones and tablets, Teacher Portal works only in its app, which keeps lesson content protected from screenshots and
          screen recording.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, opacity: 0.75 }}>
          Don&apos;t have the app yet? Ask your school administrator for it.
        </p>
      </div>
    </main>
  );
}

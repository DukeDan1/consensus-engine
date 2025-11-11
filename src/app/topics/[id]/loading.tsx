export default function LoadingTopic() {
  return (
    <div className="container py-5 d-flex justify-content-center align-items-center" style={{ minHeight: "40vh" }}>
      <div className="spinner-border text-primary" role="status" aria-label="Loading topic">
        <span className="visually-hidden">Loading…</span>
      </div>
    </div>
  );
}

export default function SearchLoading() {
    return (
        <div className="d-flex justify-content-center align-items-center" style={{ height: '10vh' }}>
            <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
            </div>
        </div>
    );
}
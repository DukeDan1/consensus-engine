"use client";

export default function FactCard({
    fact,
}: {
    fact: {
        id: string;
        text: string;
        sourceArgument: string; 
        createdAt?: string;
    };
}) {
    function scrollToArgument() {
        const targetId = `argument-${fact.sourceArgument}`;
        const el = document.getElementById(targetId);
        if (!el) return;
        // Smooth scroll to the argument
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Briefly highlight the card area
        const highlightEl = (el.querySelector('.card') as HTMLElement) || el;
        const prevTransition = highlightEl.style.transition;
        const prevBg = highlightEl.style.backgroundColor;
        highlightEl.style.transition = 'background-color 0.6s ease';
        highlightEl.style.backgroundColor = '#fff3cd'; // soft highlight
        setTimeout(() => {
            highlightEl.style.backgroundColor = prevBg || '';
            highlightEl.style.transition = prevTransition;
        }, 1200);
    }
    return (
       <li key={fact.id} className="list-group-item">
                <div className="d-flex justify-content-between align-items-start">
                  <div style={{ maxWidth: "80%" }}>
                    <strong>Fact:</strong> {fact.text}
                    <div className="small mt-1">
                        <button type="button" className="btn btn-link p-0 align-baseline" onClick={scrollToArgument}>
                            View source argument
                        </button>
                    </div>
                  </div>
                  <span className="badge text-bg-light">AI</span>
                </div>
        </li>
    );
}
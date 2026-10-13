import { useLayoutEffect } from "react";

export const AIX_PHONE_LAYOUT = "(max-width: 767px), (max-width: 1100px) and (max-height: 600px)";

// Mark phone chapters for continuous reading; desktop keeps its existing pager.
export function useAiXMobileLayout(containerRef, enabled = true) {
    useLayoutEffect(() => {
        const root = containerRef.current;
        if (!enabled || !root) return;
        const media = window.matchMedia(AIX_PHONE_LAYOUT);
        const pages = new Set();
        const update = () => {
            const sections = root.matches(".aix-page")
                ? [root]
                : root.querySelectorAll(".aix-page, #registration-form[data-contained-form]");
            for (const page of sections) {
                pages.add(page);
                if (media.matches) page.dataset.aixFit = "flow";
                else page.removeAttribute("data-aix-fit");
            }
        };
        const content = new MutationObserver(update);
        content.observe(root, { childList: true, subtree: true });
        media.addEventListener("change", update);
        update();
        return () => {
            content.disconnect();
            media.removeEventListener("change", update);
            for (const page of pages) page.removeAttribute("data-aix-fit");
        };
    }, [containerRef, enabled]);
}

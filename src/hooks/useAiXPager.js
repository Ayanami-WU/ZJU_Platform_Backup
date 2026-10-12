import { useEffect } from "react";

// Keep overflow inside the current screen until its edge, then turn one page.
export function useAiXPager(containerRef, ids, enabled, reduceMotion) {
    useEffect(() => {
        const root = containerRef.current;
        if (!enabled || !root) return;
        let locked = false,
            timer,
            touchStart;
        const sections = () => ids.map((id) => root.querySelector(`#${id}`)).filter(Boolean);
        const top = (el) =>
            el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
        const nestedCanScroll = (target, direction) => {
            for (let el = target; el instanceof Element && el !== root; el = el.parentElement) {
                if (
                    /auto|scroll/.test(getComputedStyle(el).overflowY) &&
                    el.scrollHeight > el.clientHeight + 2
                ) {
                    if (
                        direction > 0
                            ? el.scrollTop + el.clientHeight < el.scrollHeight - 2
                            : el.scrollTop > 2
                    )
                        return true;
                }
            }
            return false;
        };
        const turn = (direction, target, event) => {
            if (target.closest('input, textarea, select, [contenteditable="true"], dialog[open]'))
                return;
            if (nestedCanScroll(target, direction)) return;
            const pages = sections();
            const current = pages.reduce(
                (best, el, i) =>
                    Math.abs(top(el) - root.scrollTop) < Math.abs(top(pages[best]) - root.scrollTop)
                        ? i
                        : best,
                0
            );
            const next = Math.max(0, Math.min(pages.length - 1, current + direction));
            if (current === next || !pages[next]) return;
            event.preventDefault();
            if (locked) return;
            locked = true;
            root.scrollTo({ top: top(pages[next]), behavior: reduceMotion ? "instant" : "smooth" });
            clearTimeout(timer);
            timer = setTimeout(
                () => {
                    locked = false;
                },
                reduceMotion ? 180 : 800
            );
        };
        const wheel = (e) => {
            if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) > 7)
                turn(Math.sign(e.deltaY), e.target, e);
        };
        const key = (e) => {
            if (
                e.target.closest(
                    'input, textarea, select, button, a, [contenteditable="true"], dialog[open]'
                )
            )
                return;
            const direction = { PageDown: 1, PageUp: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
            if (direction) turn(direction, e.target, e);
        };
        const start = (e) => {
            touchStart =
                e.touches.length === 1 ? { y: e.touches[0].clientY, target: e.target } : null;
        };
        const move = (e) => {
            if (!touchStart || e.touches.length !== 1) return;
            const delta = touchStart.y - e.touches[0].clientY;
            if (Math.abs(delta) > 45) {
                turn(Math.sign(delta), touchStart.target, e);
                touchStart = null;
            }
        };
        root.addEventListener("wheel", wheel, { passive: false });
        root.addEventListener("keydown", key);
        root.addEventListener("touchstart", start, { passive: true });
        root.addEventListener("touchmove", move, { passive: false });
        return () => {
            clearTimeout(timer);
            root.removeEventListener("wheel", wheel);
            root.removeEventListener("keydown", key);
            root.removeEventListener("touchstart", start);
            root.removeEventListener("touchmove", move);
        };
    }, [containerRef, ids, enabled, reduceMotion]);
}
